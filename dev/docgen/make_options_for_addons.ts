import * as ts from "typescript"
import { forEachChild, Node } from "typescript"
import * as path from "path"
import { program, srcPath } from "./base"
import { isExported, getNamedDeclarations } from "./tsUtil";
import { makeComponentLink, InterfaceProperty, makePropertiesSection, extractInterfaceProperties, makeAutoDocNotice } from "./genUtils";

const config = require("../HyperMD.config")

export interface AddonInfo {
  name: string, // "addon/foobar"
  brief_description: string, // "One sentence introducing Foobar"
  description: string, // leadingComments, including brief_description

  Options: InterfaceProperty[],
}

export interface EditorOptionItem extends InterfaceProperty {
  addon: AddonInfo,
}

export function make(): string {
  var optionItems = [] as EditorOptionItem[]

  //#region [phase #1] scan all addon files ---------------------------------------------------------

  for (const compFileName in config.components) {
    if (!/^addon\//.test(compFileName)) continue

    const compFilePath = path.join(srcPath, compFileName + ".ts")
    const sf = program.getSourceFile(compFilePath)

    var addon: AddonInfo = {
      name: compFileName,
      Options: [],
      description: "",
      brief_description: sf.text.match(/^\s*(?:\/\/|\/?\*+)\s+DESCRIPTION:\s*(.+)$/m)[1],
    }

    var currentNameSpace = "" // with "global." name. If is empty, means current module context

    function visitor(node: Node) {
      if (ts.isModuleDeclaration(node)) {
        // change `currentNameSpace` if needed

        let name = node.name.text
        let oldNameSpace = currentNameSpace

        if (!currentNameSpace) currentNameSpace = "global"
        if (name != "global") currentNameSpace += "." + name

        forEachChild(node, visitor)

        currentNameSpace = oldNameSpace
        return
      }

      if (ts.isInterfaceDeclaration(node)) {
        if (!currentNameSpace && !isExported(node)) return

        let name = node.name.text

        if (currentNameSpace == "") {
          if (name == 'Options') extractInterfaceProperties(node, addon.Options, sf)
        }

        if (currentNameSpace == "global.HyperMD") {
          if (name == 'EditorConfiguration') {
            extractInterfaceProperties(node, optionItems, sf, (it: EditorOptionItem) => {
              it.addon = addon
              it.type = it.type.replace(/Partial\<\[(\w+)\][^\>]+\>/, "`Partial<$1>`")
              it.description = it.description.replace(/^/gm, "> ")
              return true
            })
          }
        }
      }

      forEachChild(node, visitor)
    }
    forEachChild(sf, visitor)
  }

  //#endregion

  var result = [
    "# HyperMD Configurations",
    makeAutoDocNotice(__filename),
  ]

  //#region [phase #2] make the result      ---------------------------------------------------------

  { // editor property table
    let tableLines = [
      "| Name | Addon | Addon Description |",
      "| ---- | ---- | ---- |",
    ]
    for (const opt of optionItems) {
      tableLines.push(`| ${opt.name} | ${makeComponentLink(opt.addon.name)} | ${opt.addon.brief_description} |`)
    }
    result.push(tableLines.join("\n"))
  }

  for (const opt of optionItems) {
    const addon = opt.addon

    let sectionLines = [
      "\n\n\n",
      `## ${opt.name}`,
      ``,
      `📦 **Provided by ${makeComponentLink(addon.name)}** : ${addon.brief_description}`,
      ``,
      `🎨 **Type** : ${opt.type}`,
      ``,
      opt.description,
    ]

    if (addon.Options.length > 0) {
      sectionLines.push(
        ``,
        makePropertiesSection(addon.Options),
      )
    }

    result.push(sectionLines.join("\n"))
  }

  //#endregion

  return result.join("\n\n")
}

if (require.main === module) {
  console.log(make())
}
