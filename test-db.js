require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'reports' }).catch(e => ({error: e}));
  console.log("RPC get_table_info:", error ? error.message : data);
  
  if (error || !data) {
    // If rpc doesn't exist, let's just attempt an insert that mimics the upload route
    console.log("Testing insert...");
    const { data: ins, error: insErr } = await supabase.from('reports').insert({
      company_name: "Test Company",
      pdf_url: "http://example.com/test.pdf",
      status: "processing"
    }).select('id');
    console.log("Insert result:", JSON.stringify({ins, insErr}, null, 2));
  }
}
run();
