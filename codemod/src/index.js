// AST Example
// https://astexplorer.net/#/gist/b6ad2c32706630c201c88ff2065e7866/1a8b190dd864d8877416a6cdd00fa7d9cf5250be

const fs = require('fs');
const recast = require('recast');

const TransformersMap = require('./transformers');
const Files = require('./files');
const Utils = require('./utils');
const Imports = require('./imports');

// const code = fs.readFileSync('../evaporate.js');
const code = fs.readFileSync('./examples/example-1.js');

const ast = recast.parse(code);
const body = ast.program.body[0];
const blockStatement = body.expression.callee.body;

const codeBuilder = item => {
  const itemTypeTransformer = TransformersMap[item.type];

  if (itemTypeTransformer) {
    return itemTypeTransformer(item)
  }
}

blockStatement.body.forEach(codeBuilder)

Files
  .getFilenames()
  .map((filename, i) => {
    const fileAST = Files.getFileAST(filename)

    const globalPrefixedIdentifiers = filename !== 'Global' ? Utils.replaceGlobalIdentifier(fileAST) : [];
    
    const requires = Imports.getRequires({
      filename,
      fileAST,
      hasGlobal: Boolean(globalPrefixedIdentifiers.length) 
    });

    let code = fileAST
      .map(statement => recast.prettyPrint(statement, { tabWidth: 2 }).code)
      .join('\n');

    code = `${requires}${code}`;

    return { code, filename }
  })
  .forEach(({ code, filename }) => fs.writeFileSync(`./output/${filename}.js`, code))