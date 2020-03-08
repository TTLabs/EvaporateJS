// AST Example
// https://astexplorer.net/#/gist/b6ad2c32706630c201c88ff2065e7866/1a8b190dd864d8877416a6cdd00fa7d9cf5250be

const fs = require('fs');
const util = require('util');
const recast = require('recast');
const { convertJsToTs } = require('js-to-ts-converter');

const promWriteFile = util.promisify(fs.writeFile)

const Constants = require('./constants');

const Files = require('./files');
const Imports = require('./imports');
const Exports = require('./exports');

const { addGlobalPrefix } = require('./utils');
const { collectClassesDeclaration } = require('./collector');

const { 
  ExecuteTransformerMap, 
  transformerClassDeclaration,
  transformES6
} = require('./transformer');

const rawCode = fs.readFileSync('../evaporate.js').toString();
// const rawCode = fs.readFileSync('./examples/example-1.js').toString();

const es6Code = transformES6(rawCode);
fs.writeFileSync('./output/es6Code.js', es6Code);

const ast = recast.parse(es6Code);
const body = ast.program.body[0];
const blockStatement = body.expression.callee.body;

const executeTransformer = item => {
  const itemTypeTransformer = ExecuteTransformerMap[item.type];

  return itemTypeTransformer && itemTypeTransformer(item);
}

const mapClasses = collectClassesDeclaration(blockStatement.body);
Array.from(mapClasses).forEach(transformerClassDeclaration)

blockStatement.body.forEach(executeTransformer)

const transformedFiles = Files
  .getFilenames()
  .map((filename, i) => {
    const fileAST = Files.getFileAST(filename)

    const globalPrefixedIdentifiers = filename !== 'Global' ? addGlobalPrefix(fileAST) : [];
    
    const requires = Imports.getRequires({
      filename,
      fileAST,
      hasGlobal: Boolean(globalPrefixedIdentifiers.length) 
    });

    const exports = Exports.getExports(filename)

    let code = fileAST
      .map(statement => recast.prettyPrint(statement, { tabWidth: 2 }).code)
      .join('\n');
    
    code = `${requires}${code}${exports}`;

    return { code, filename }
  })

const writeFiles = ({ code, filename }) => promWriteFile(`./output/${filename}.js`, code)
  
const execute = async () => {
  const writtenFiles = transformedFiles.map(writeFiles)
  
  await Promise.all(writtenFiles);
  await convertJsToTs('./output')
}

execute();
