#!/usr/bin/env node

// File handling
import url from 'url';
import { basename, extname } from 'path';
import relative from '@aredridel/url-relative';

// Util
import wordWrap from 'word-wrap';

import WikiMap from "./wikimap.js";


function mapToDot(root, map) {
    let out = "digraph {\n"
    let subgraphs = {};
    out += `tooltip=" ";\n`
    out += `newrank=true;\n`
    out += `graph [fontname="inherit" bgcolor="transparent"];\n`
    out += `node [fontname="inherit" tooltip=" " shape="note" width="2"];\n`
    out += `edge [fontname="inherit" tooltip=" "];\n`
    for (const [url, el] of Object.entries(map)) {
        const filename = decodeURIComponent((new URL(url)).pathname)
        const title = el.brief || el.title || basename(filename, extname(filename))
        const place = el.place
        const status = (el.status || 'final').toLowerCase() 
        const label = [`${title}\n\n`, el.characters ? el.characters.join(', ') : null]
            .filter(e=>e)
            .map(e => wordWrap(e, { width: 20, newline: "\n", indent: '', trim: true }))
            .join("\n")
        const href = relative(String(root), String(url))
        if (place) {
            subgraphs[place] = (subgraphs[place] || []).concat(url);
        }
        const color = status == 'draft' ? "gray50" : status == "outline" ? "gray75" : "black";
        out += `"${url}" [label=${JSON.stringify(label + "\n").replace(/\\n/g, "\\l")} href="${href}" color="${color}" fontcolor="${color}"];\n`
        if (el.children) {
            for (const child of el.children) {
                if (/^Prev/.test(child.text)) continue;
                const text = wordWrap(child.text, { width: 20, newline: "\n", indent: '', trim: true })
                const [, ,label] = (/(\()(.*?)(\))/.exec(text) || [])
                if (child.text.trim() == 'Next') {
                    out += `"${url}" -> "${child.url}";\n`
                } else if (label) {
                    out += `"${url}" -> "${child.url}" [label=${JSON.stringify(label)}];\n`
                } else {
                    out += `"${url}" -> "${child.url}" [label=${JSON.stringify(text)}];\n`
                }
                if (/\bAlt\b|\bAlternate\b/.test(child.text)) {
                    out += `{ rank = same; "${url}"; "${child.url}" }\n`
                }
            }
        } else {
            out += `"${url}" -> "${el.error}";\n`
        }
    }
    let n = 0;
    for (const [ place, nodes ] of Object.entries(subgraphs)) {
        out += `subgraph cluster_${n++} {
            label="${place}";
            ${nodes.map(JSON.stringify).join("; ")};
        }\n`

    }
    out += "}\n"
    return out
}

if (!process.argv[2]) {
    console.warn(`use: ${process.argv.slice(1).join(' ')} filename`);
    process.exit(1);
}

const st = process.argv.slice(2).map(x => url.pathToFileURL(x))

const map = new WikiMap

map.run(st).then(e => mapToDot(url.pathToFileURL('.'), e)).then(console.log, console.warn)
