// Arma el sitio propio (GitHub Pages): la misma web, a pantalla completa, con los datos del servidor.
const fs=require('fs');const app=fs.readFileSync('app5.html','utf8');
const icon="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1e5e3b"/><rect x="20" y="14" width="24" height="34" rx="4" fill="#f3c300" transform="rotate(-10 32 31)"/></svg>');
const html=`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<title>Apostar con criterio</title>
<meta name="description" content="Partidos, cuotas y probabilidades para decidir mejor, no para apostar más. +18.">
<meta name="theme-color" content="#1e5e3b">
<meta property="og:title" content="Apostar con criterio">
<meta property="og:description" content="Partidos de hoy, cuotas actualizadas y probabilidades explicadas. Para decidir mejor, no para apostar más. +18.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://apostarconcriterio.github.io/">
<link rel="icon" href="${icon}">
</head><body>
${app}
</body></html>
`;
fs.mkdirSync('../site',{recursive:true});fs.writeFileSync('../site/index.html',html);fs.writeFileSync('../site/.nojekyll','');console.log('site/index.html',html.length);
