# Approved Toothlogy banners (1920 × 600)

Drop the approved image files here, named exactly after their registry slug —
`banner-dental-hospital.webp`, `banner-dental-cta.jpg`, and so on. Accepted
extensions, in preference order: `.webp`, `.avif`, `.jpg`, `.jpeg`, `.png`.

Then run:

```bash
npm run assets:sync
```

That records which files arrived. Until a file is present, every surface that
would show it renders nothing at all — never a placeholder, a grey box, or a
stock substitute.

`npm run assets:audit` lists what is still outstanding.

The slug list is `src/platform/media/assets.ts`. A file whose name matches no
slug is reported and ignored rather than guessed at: silently adopting
`crown-final-v2.jpg` as the crown image is how the wrong photograph ends up on
a treatment page.
