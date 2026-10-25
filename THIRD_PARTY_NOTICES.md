# Third-party notices

Workify includes code adapted from the following third-party project.

## Vengeance UI

- Repository: https://github.com/Ashutoshx7/VengeanceUI
- Commit: `1a8d1328f9dfce357aa0b356a605e7f17af3d62b` (main, 2026-10-17)
- License: MIT

Adapted items (rewritten for Workify; no upstream assets, fonts, names or copy are included):

| Upstream component | Workify adaptation |
|---|---|
| `line-hover-link` (slide/grow variant) | `.wf-underline` in `src/app/globals.css` |
| `faq-accordion` | `.wf-details` in `src/app/globals.css`, used by `src/app/[lang]/faq/page.tsx` |
| `glow-border-card` | `.wf-glow` in `src/app/globals.css` and `src/components/ui/GlowBorder.tsx` |
| `stats-counter` | `src/components/tool/countUp.ts` (rewritten without framer-motion) |

```
MIT License

Copyright (c) 2025-2026 Ashutoshx7

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
