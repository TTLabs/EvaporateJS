const Files = require('./files');

const { collectIdentifiers, collectClasses } = require('./utils');

const getFileFunctions = file => Files
  .getFileAST(file)
  .map(func => func.id.name);

const getConstants = () => Files
  .getFileAST('Constants')
  .map(variable => variable.declarations[0])
  .map(variable => variable.id.name);

function importUtils(filename, ast) {
  if (filename === 'Utils') {
    return '';
  }

  const utilFunctions = getFileFunctions('Utils');

  return collectIdentifiers(ast, utilFunctions);
}

function importConstants(filename, ast) {
  if (filename === 'Constants') {
    return '';
  }

  const constants = getConstants();
  return collectIdentifiers(ast, constants);
}

function formatNamedRequire(filename, requires) {
  if (requires.length === 0) {
    return '';
  }

  return `const { ${requires.join(', ')} } = require('./${filename}');\n`;
}

function formatDefaultRequire(require) {
  return `const ${require} = require('./${require}');\n`;
}

function getRequires({ filename, ast, hasGlobal }) {
  const utils = importUtils(filename, ast);
  const constants = importConstants(filename, ast);  

  const requireClasses = collectClasses(ast)
    .filter(collected => collected !== filename)
    .map(formatDefaultRequire);

  const requires = [
    ...requireClasses,
    hasGlobal && formatDefaultRequire('Global'),
    formatNamedRequire('Constants', constants),
    formatNamedRequire('Utils', utils)
  ]
  .filter(Boolean)
  .join('');

  return `${requires}\n`;
}

module.exports.getRequires = getRequires;