| No colour literal outside the palette files | `grep -rnE '#[0-9a-fA-F]{3,8}\b' src/ --include='*.js' --include='*.css' --include='*.html' \| grep -v 'palette'` | no output |
| No off-origin request from the page | ``grep -rnE "fetch[A-Za-z]*\(\s*.(https?:)?//" src/; grep -rnE "(new (WebSocket\|EventSource)\|sendBeacon\|import)\(\s*.(https?:\|wss?:)?//\|\.src\s*=\s*.(https?:)?//\|src=.(https?:)?//" src/; grep -rnE "['\"\`](https?\|wss?)://" src/ \| grep -v 'www.w3.org'`` | no output |
| No randomness in drawing or in a function | `grep -rn 'Math\.random' src/ api/` | no output |
| Short cache windows only | `grep -n immutable vercel.json; grep -A1 '"Cache-Control"' vercel.json \| grep -E '(^\|[ ,"])max-age=(30[1-9]\|3[1-9][0-9]\|[4-9][0-9]{2}\|[0-9]{4,})'` | no output |
| Both shells addressed (UI plans only) | read the diff | laptop and phone paths both present |

Notes on those greps: the cache check looks for `immutable` and for a
`Cache-Control` `max-age` over 300 seconds (the HSTS `max-age` is exempt); a module served from `src/` has to be
re-fetched soon after a deploy, so its window stays at or under 300. The
function's own `s-maxage` is a separate, deliberate edge window and is not
flagged.
