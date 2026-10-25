const secret = Bun.env.OPENROUTER_API_KEY?.trim()
let checked = 0
for await (const path of new Bun.Glob('dist/**/*.{js,css,html,json,map,txt}').scan('.')) {
  const value = await Bun.file(path).text()
  if (secret && secret.length > 12 && value.includes(secret) || /sk-or-v1-[0-9A-Za-z]{24,}/.test(value)) {
    throw new Error(`Credential found in public artifact: ${path}`)
  }
  checked++
}
if (!checked) {
  throw new Error('No build artifacts were found.')
}
console.log(`Secret scan passed: ${checked} public text assets.`)
