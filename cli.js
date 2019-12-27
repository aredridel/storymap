#!/usr/bin/env node

// File handling
import url from 'url';

import WikiMap from "./wikimap.js";
import mapToDot from "./mapToDot.js";

if (!process.argv[2]) {
    console.warn(`use: ${process.argv.slice(1).join(' ')} filename`);
    process.exit(1);
}

const st = process.argv.slice(2).map(x => url.pathToFileURL(x))

const map = new WikiMap

map.run(st).then(e => mapToDot(url.pathToFileURL('.'), e)).then(console.log, console.warn)

