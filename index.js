#!/usr/bin/env node

// File handling
const { promisify } = require('util');
const url = require('url')
const { basename, extname } = require('path')
const relative = require('@aredridel/url-relative')

// File parsing
const readFile = promisify(require('fs').readFile)
const unified = require('unified')
const markdown = require('remark-parse')

const parser = unified()
    .use(markdown)

const frontMatter = require('front-matter')

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

// Util
const uniq = require('array-uniq')
const wordWrap = require('word-wrap')

function unsmart(s) {
    return s.replace(/[“”]/, '"').replace(/[‘’]/, "'")
}


class WikiMap {
    constructor() {
        this.characters = []
    }


    async run(start) {
        const getCharactersFromURL = async (u) => {
            const path = url.fileURLToPath(u)
            const file = await readFile(path, 'utf-8')
            const { body, attributes } = frontMatter(file)
            const text = (await stripper.process(body)).toString()

            if ( attributes.characters ) {
                compromise.plugin({
                    words: attributes.characters.reduce((a, e) => ({ [e]: 'Person', ...a }), {})
                })
            }
            
            const characters = (
                attributes.characters
                ? attributes.characters
                : compromise(unsmart(text)).people().out('topk').filter(e => e.percent > 20).map(e => e.normal)
            )
                .map(e => e.replace(/^[a-z]/, l => l.toUpperCase()))

            this.characters = uniq(this.characters.concat(characters))

            return characters
        }

        const getLinksFromURL= async (u) => {
            const path = url.fileURLToPath(u)
            const file = await readFile(path, 'utf-8')
            const { body } = frontMatter(file)
            const ast = parser.parse(body)
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
}

function mapToDot(root, map) {
    let out = "digraph {\n"
    out += `graph [size="15 100" fontname="inherit" bgcolor="transparent"];\n`
    out += `node [fontname="inherit"];\n`
    out += `edge [fontname="inherit"];\n`
    for (const [url, el] of Object.entries(map)) {
        const filename = decodeURIComponent((new URL(url)).pathname)
        const label = [`<B>${basename(filename, extname(filename))}</B>`, el.characters ? el.characters.join(', ') : null]
            .filter(e=>e)
            .map(e => wordWrap(e, { width: 20, newline: "<BR/>", indent: '', trim: true }))
            .join("<BR/>")
        const href = relative(root, url)
        out += `"${url}" [label=<${label}> href="${href}"];\n`
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

const map = new WikiMap

map.run(root).then(e => mapToDot(root, e)).then(console.log, console.warn)
