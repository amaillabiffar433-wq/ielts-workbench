# Original demo pack

Every passage, prompt, question, answer, and identifier in this folder was
written specifically for IELTS Workbench. It contains no Cambridge IELTS or
third-party test material.

The listening fixture is four seconds of deterministic PCM silence. Regenerate
it from the repository root with:

```powershell
node .\samples\original-demo-pack\scripts\generate-silent-wav.mjs
```

The script prints the byte length and SHA-256 digest. A correct regeneration is
64,044 bytes with SHA-256
`bff9ae2d1c0defb0f2b9070f43439fcb723621dbeb1cca5e2dbadcd9bfb13c68`.
