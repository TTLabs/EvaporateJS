const Files = require('./files');

const { getConstants, getFileFunctions } = require('./utils');
const { collectIdentifiers, collectClassesUsage } = require('./collector');

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

  return `import { ${requires.join(', ')} } from './${filename}';\n`;
}

function formatSingleRequire(require) {
  return `import { ${require} } from './${require}';\n`;
}

function getRequires({ filename, fileAST, hasGlobal }) {
  const utils = importUtils(filename, fileAST);
  const constants = importConstants(filename, fileAST);  

  const requireClasses = collectClassesUsage(fileAST)
    .filter(collected => collected !== filename)
    .map(formatSingleRequire);

  const requires = [
    ...requireClasses,
    hasGlobal && formatSingleRequire('Global'),
    formatNamedRequire('Constants', constants),
    formatNamedRequire('Utils', utils)
  ]
  .filter(Boolean)
  .join('');

  return `${requires}\n`;
}

module.exports.getRequires = getRequires;