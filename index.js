#!/usr/bin/env node

// File handling
const { promisify } = require('util');
const url = require('url')
const { basename } = require('path')
const relative = require('@aredridel/url-relative')

// File parsing
const readFile = promisify(require('fs').readFile)
const unified = require('unified')
const markdown = require('remark-parse')

const parser = unified()
    .use(markdown)

// Text parsing
const compromise = require('compromise')
const remark2text = require('remark-retext')
const retextStringify = require('retext-stringify')
const english = require('retext-english')
const pos = require('retext-pos')

const stripper = unified()
    .use(markdown)
    .use(remark2text, english.Parser)
    .use(pos)
    .use(retextStringify)

function unsmart(s) {
    return s.replace(/[“”]/, '"').replace(/[‘’]/, "'")
}

async function getCharactersFromURL(u) {
    const path = url.fileURLToPath(u)
    const d = await readFile(path, 'utf-8')
    const text = (await stripper.process(d)).toString()
    
    const arr = compromise(unsmart(text)).people().out('topk').filter(e => e.percent > 20).map(e => e.normal.replace(/^[a-z]/, l => l.toUpperCase()))

    return arr
}

async function getLinksFromURL(u) {
    const path = url.fileURLToPath(u)
    const file = await readFile(path, 'utf-8')
    const ast = parser.parse(file)
    return getLinks(u, ast)
}

function getLinks(u, ast) {
    if (ast.type == 'link') {
        return [{url: url.resolve(u, ast.url), text: ast.children[0].value}]
    } else if (ast.children) {
        return ast.children.map(e => getLinks(u, e)).reduce((a, e) => a.concat(e), [])
    } else {
        return []
    }
}

async function wikiMap(start) {
    const seen = new Set;
    const map = {};
    let queue = [start];
    let el;
    while (el = queue.pop()) {
        if (seen.has(el) || (new URL(el)).protocol != 'file:') continue;
        seen.add(el)
        try {
            map[el] = { children: await getLinksFromURL(el), characters: await getCharactersFromURL(el) }
            queue = queue.concat(map[el].children.map(e => url.resolve(el, e.url)))
        } catch (e) {
            if (e.code != 'ENOENT') throw e;
            map[el] = { error: 'ENOENT' }
        }
    }
    return map
}

function mapToDot(root, map) {
    let out = "digraph {\n"
    for (const [url, el] of Object.entries(map)) {
        out += `"${url}" [label="${basename(decodeURIComponent((new URL(url)).pathname))}\\n${el.characters.join(', ')}" href="${relative(root, url)}"];\n`
        if (el.children) {
            for (const child of el.children) {
                out += `"${url}" -> "${child.url}" [label="${child.text}"];\n`
            }
        } else {
            out += `"${url}" -> "${el.error}";\n`
        }
    }
    out += "}\n";
    return out;
}

if (!process.argv[2]) {
    console.warn(`use: ${process.argv.slice(1).join(' ')} filename`);
    process.exit(1);
}

const root = url.pathToFileURL(process.argv[2]).href 
wikiMap(root).then(e => mapToDot(root, e)).then(console.log, console.warn)
