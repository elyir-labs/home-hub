// What a page lets run: scripts and requests to this site only. The same words are in _headers, which covers the pages
// when no function runs; functions/_middleware.js puts them on the pages it touches, since Pages applies _headers
// only to what it serves itself. site.test.mjs holds the two to each other.
export const POLICY = "script-src 'self'; connect-src 'self'"
