import { basename, extname } from 'path';
import relative from '@aredridel/url-relative';
import wordWrap from 'word-wrap';

const statusToColor = {
    "vignette": "LightSteelBlue",
    "draft" : "gray50",
    "outline" : "gray75"
};

export default function mapToDot(root, map) {
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
        const pov = el.pov
        const status = (el.status || 'final').toLowerCase() 

        if (pov) {
            if (el.characters.includes(pov)) {
                el.characters = el.characters.filter(e => e != pov);
            }
            el.characters.unshift(pov);
        }

        const label = [
          `${title}`,
          `\n\n`, el.characters ? el.characters.join(', ') : null
        ]
            .filter(e=>e)
            .map(e => wordWrap(e, { width: 20, newline: "\n", indent: '', trim: true }))
            .join("\n")
        const href = relative(String(root), String(url))
        if (place) {
            subgraphs[place] = (subgraphs[place] || []).concat(url);
        }
        const color = statusToColor[status] || "black";
        out += `"${url}" [label=${JSON.stringify(label + "\n").replace(/\\n/g, "\\l")} href="${href}" color="${color}" fontcolor="${color}"];\n`
        if (el.children) {
            for (const child of el.children) {
                if (/^Prev/.test(child.text)) continue;
                const text = wordWrap(child.text, { width: 20, newline: "\n", indent: '', trim: true })
                const [, ,label] = (/(\()(.*?)(\))/.exec(text) || [])
                const edgeParams = {};
                if (label) {
                    edgeParams.label = label;
                } else if (text != 'Next' && text != 'Later') {
                    edgeParams.label = text;
                }

                if (text == 'Later') {
                    edgeParams.weight = 0;
                    edgeParams.color = "gray75";
                } else {
                    edgeParams.weight = 1000;
                }

                out += `"${url}" -> "${child.url}" [${Object.entries(edgeParams)
                        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                        .join(' ')}];\n`
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

