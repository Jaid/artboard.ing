// The build is published as is, so it must never contain an OpenRouter key, like one pasted into the source while testing.
let checked = 0
for await (const path of new Bun.Glob('dist/**/*.{js,css,html,json,map,txt}').scan('.')) {
  const value = await Bun.file(path).text()
  if (/sk-or-v1-[0-9A-Za-z]{24,}/.test(value)) {
    throw new Error(`Credential found in public artifact: ${path}`)
  }
  checked++
}
if (!checked) {
  throw new Error('No build artifacts were found.')
}
console.log(`Secret scan passed: ${checked} public text assets.`)
