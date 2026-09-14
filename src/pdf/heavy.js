// Nothing but a handle on the heavy chunk.
//
// pdf-lib and fontkit are about 1.3 MB of the build. They live in a chunk
// shared by render.js and cover.js, which is why neither is fetched until
// somebody asks for a file. That is the right default and it leaves one
// problem: the fetch then happens at the click, on a cell connection, with a
// person watching a status line.
//
// main.js imports this module during idle time to pull that chunk down early.
// It exists as its own file rather than main.js simply importing render.js
// because the launch dashboard reads the funnel out of Cloudflare's request
// log with no analytics script: a request for render-*.js means somebody made
// a book, and a request for cover-*.js means somebody made a cover. Warming
// through render.js would have made every visitor look like a buyer. Warming
// through here asks for heavy-*.js and the shared chunk, and leaves both of
// those signals meaning exactly what they meant before.
export { PDFDocument } from "pdf-lib";
export { default as fontkit } from "@pdf-lib/fontkit";
