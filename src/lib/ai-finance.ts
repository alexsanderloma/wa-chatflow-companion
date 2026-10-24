export function financeTotals(rows: Array<{input_tokens:number|null; output_tokens:number|null;estimated_credits:number|null;confirmed_credits:number|null;status:string}>) {
  return rows.reduce((sum,row)=>({
    input:sum.input+(row.input_tokens??0), output:sum.output+(row.output_tokens??0),
    unknown:sum.unknown+(row.input_tokens===null || row.output_tokens===null ? 1:0),
    estimated:sum.estimated+(row.estimated_credits??0), confirmed:sum.confirmed+(row.confirmed_credits??0),
    unpriced:sum.unpriced+(row.estimated_credits===null?1:0), unconfirmed:sum.unconfirmed+(row.confirmed_credits===null?1:0), failures:sum.failures+(row.status==='success'?0:1),
  }),{input:0,output:0,unknown:0,estimated:0,confirmed:0,unpriced:0,unconfirmed:0,failures:0});
}