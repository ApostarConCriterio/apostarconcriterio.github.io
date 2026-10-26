const fs=require('fs');const {minify}=require('/home/claude/web/v3/node_modules/terser');
(async()=>{const h=fs.readFileSync('app5.html','utf8');const i=h.lastIndexOf('<script>\n'),j=h.lastIndexOf('\n</script>');
const r=await minify(h.slice(i+9,j),{compress:{passes:2},mangle:{toplevel:false},format:{ascii_only:false}});
let css=h.slice(0,i).replace(/<style>([\s\S]*?)<\/style>/,(m,c)=>'<style>'+c.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s*\n\s*/g,'').replace(/\s*([{};:,])\s*/g,'$1')+'</style>');
css=css.replace(/>\s+</g,'><');
const out=css+'<script>'+r.code+'</script>';fs.writeFileSync('app5.min.html',out);console.log(h.length,'->',out.length)})();
