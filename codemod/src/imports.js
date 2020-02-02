const Files = require('./files');

const { collectIdentifiers, collectClasses, getConstants, getFileFunctions } = require('./utils');

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

function formatSingleRequire(require) {
  return `const { ${require} } = require('./${require}');\n`;
}

function getRequires({ filename, ast, hasGlobal }) {
  const utils = importUtils(filename, ast);
  const constants = importConstants(filename, ast);  

  const requireClasses = collectClasses(ast)
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