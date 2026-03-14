# GreenWash — Next Steps

---

## 1. Claims Section Layout Redesign

The claims section should NOT be a single scrollable column of expanded claims. It should have the same two-panel layout as the document page.

### Layout
- **Left sidebar (360px fixed):** scrollable list of all claim cards — same as the document page sidebar. Each card shows claim text (truncated), verdict pill, category pill, and credibility score bar. Clicking a card selects it and loads it in the main panel. Do not expand inline.
- **Main panel (flex-1):** shows the full detail of the selected claim. Default state before any claim is selected: show a placeholder "Select a claim to view details."

### Main Panel — Selected Claim Detail

The main panel has two distinct sections:

**Section A — Sources**
- Heading: "Evidence"
- All evidence cards for this claim, each showing:
  - Source name + date
  - Snippet of text in DM Mono
  - Supports or Contradicts tag (green / red)
  - "View source →" link if URL exists
- If there are zero sources: show "No evidence found for this claim."

**Section B — AI Reasoning**
- Heading: "AI Reasoning"
- A visually distinct box — use `background: #F7F8F7`, `border-radius: 12px`, `border-left: 3px solid #85C391`
- Inside: the GPT reasoning paragraph in DM Sans
- Below the reasoning paragraph: the credibility score displayed as a large number with the verdict pill next to it

### Credibility Score Logic — Important

The score must be reasoned, not arbitrary. Update the scoring prompt to include this instruction:

```
When determining the credibility score:
- If multiple independent sources confirm the claim with no contradicting evidence, the score must be 90–100
- If sources mostly support the claim with minor gaps, score 70–89
- If evidence is mixed — some supporting, some contradicting — score 31–69
- If evidence mostly contradicts the claim, score 10–30
- If evidence directly and clearly contradicts the claim, score 0–10
- If no evidence was found at all, return null (Unverified) — do not guess a score
The score must reflect the weight and quality of evidence, not a default middle value.
```

---

## 2. Overview Section Is Blank — Fix

The overview section is empty after a real PDF test run. This is a data pipeline issue.

### What to check

1. After the pipeline completes, run this query in Supabase to confirm claims were actually inserted:
```sql
SELECT id, verdict, confidence, category FROM claims WHERE report_id = '<your_report_id>';
```

2. If rows exist but overview is blank, the overview component is not fetching correctly. Make sure the overview query does NOT filter by verdict — it must fetch all claims:
```ts
const { data: claims } = await supabase
  .from('claims')
  .select('*')
  .eq('report_id', reportId)
// No .eq('verdict', ...) filter here
```

3. Compute all overview stats client-side from the full array:
```ts
const stats = {
  total:        claims.length,
  supported:    claims.filter(c => getVerdict(c.confidence) === 'supported').length,
  mixed:        claims.filter(c => getVerdict(c.confidence) === 'mixed').length,
  contradicted: claims.filter(c => getVerdict(c.confidence) === 'contradicted').length,
  unverified:   claims.filter(c => c.confidence === null).length,
}
```

4. If the query returns zero rows, the pipeline is not inserting claims correctly. Add a console log at the end of the pipeline to confirm how many claims were inserted:
```ts
console.log(`[Pipeline] Inserted ${claims.length} claims for report ${reportId}`)
```

5. Make sure the overview component only renders after the fetch is complete — if it renders on mount before the Supabase response arrives, it will always show empty. Use a loading state:
```ts
if (loading) return <OverviewSkeleton />
if (!claims.length) return <p>No claims found. The pipeline may still be running.</p>
```

---

## 3. PDF Highlights Are in the Wrong Position — Fix

The highlights are misplaced because the bounding box coordinates returned by GPT are estimates based on text position in the raw extracted string, not actual PDF page geometry. GPT does not have access to real pixel coordinates. Here is how to fix it properly.

### The Real Solution — Text Search Matching

Instead of relying on GPT to return bounding box coordinates, find the claim text directly inside the PDF page using `pdfjs-dist` text layer. This is accurate because it uses the actual rendered text positions from the PDF spec.

### How It Works

When rendering each page with `react-pdf-viewer`, `pdfjs-dist` exposes a text layer — a list of every text item on the page with its exact `x`, `y`, `width`, `height` in page units. Search for the claim text inside that list and use the real coordinates.

```ts
import * as pdfjsLib from 'pdfjs-dist'

async function findClaimBbox(
  pdfUrl: string,
  claimText: string,
  pageNumber: number // 1-indexed
): Promise<{ x: number; y: number; width: number; height: number } | null> {

  const pdf = await pdfjsLib.getDocument(pdfUrl).promise
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const textContent = await page.getTextContent()

  // Concatenate all text items with their positions
  const items = textContent.items as any[]

  // Find the item(s) that contain the claim text
  // Normalize whitespace for matching
  const normalizedClaim = claimText.replace(/\s+/g, ' ').trim().toLowerCase()

  let matchX = 0, matchY = 0, matchWidth = 0, matchHeight = 0
  let found = false

  for (let i = 0; i < items.length; i++) {
    // Build a running string from consecutive items to handle multi-item spans
    let running = ''
    let startItem = items[i]

    for (let j = i; j < Math.min(i + 20, items.length); j++) {
      running += (items[j].str + ' ')
      const normalized = running.replace(/\s+/g, ' ').trim().toLowerCase()

      if (normalized.includes(normalizedClaim.slice(0, 40))) {
        // Found a match — use the bounding box of the first item
        const transform = startItem.transform
        const x = transform[4]
        const y = transform[5]
        const w = startItem.width
        const h = startItem.height

        // Convert to % of page dimensions
        matchX      = (x / viewport.width) * 100
        matchY      = ((viewport.height - y - h) / viewport.height) * 100
        matchWidth  = (w / viewport.width) * 100
        matchHeight = Math.max((h / viewport.height) * 100, 1.5) // min height so it's visible
        found = true
        break
      }
    }
    if (found) break
  }

  if (!found) return null
  return { x: matchX, y: matchY, width: matchWidth, height: matchHeight }
}
```

### When to Run This

Run `findClaimBbox` for each claim after the PDF is loaded in the viewer, not during the pipeline. Store the resolved bboxes in component state:

```ts
const [resolvedBboxes, setResolvedBboxes] = useState<Record<string, BBox>>({})

useEffect(() => {
  if (!pdfUrl || !claims.length) return

  async function resolveBboxes() {
    const results: Record<string, BBox> = {}
    for (const claim of claims) {
      const bbox = await findClaimBbox(pdfUrl, claim.text, claim.page_reference ?? 1)
      if (bbox) results[claim.id] = bbox
    }
    setResolvedBboxes(results)
  }

  resolveBboxes()
}, [pdfUrl, claims])
```

Then use `resolvedBboxes[claim.id]` instead of `claim.bbox` when positioning highlight overlays. If no bbox was resolved for a claim, skip rendering its highlight — do not render a misplaced one.

### Why GPT Bbox Estimates Are Wrong

GPT returns bounding box estimates based on where the text appears in the raw extracted string. It has no knowledge of the actual PDF page layout, column positions, font sizes, or rendered coordinates. The text search approach above uses the real PDF geometry so highlights land exactly on the correct text every time.