const Files = require('./files');

const recast = require('recast');

const getFileFunctions = file => Files
  .getFileAST(file)
  .map(func => func.id.name);

const getConstants = () => Files
  .getFileAST('Constants')
  .map(variable => variable.declarations[0])
  .map(variable => variable.id.name);

function collectIdentifiers(ast, identifiers) {
  const existingIdentifiers = new Set();

  function visitIdentifier(path) {
    const { name } = path.value;

    if (!identifiers) {
      existingIdentifiers.add(name)
    } else {
      const isIdentifier = identifiers.includes(name);
      isIdentifier && existingIdentifiers.add(name)
    }
    
    return this.traverse(path);
  }

  recast.visit(ast, { visitIdentifier })

  return Array.from(existingIdentifiers);
}

const buildMemberExpression = config => new recast.types.NodePath(
  recast.types.builders.memberExpression(
    recast.types.builders.identifier(config.object),
    recast.types.builders.identifier(config.property)
  ),
  config.parentPath,
  recast.types.builders.memberExpression.name
)

function createNodePrefix(traversedPaths, scope, identifiers, path) {
  const { name } = path.value;

  if (!identifiers.includes(name) || Boolean(traversedPaths[name])) {
    return this.traverse(path)
  }

  const scopeIdentifier = recast.types.builders
    .identifier(scope);
  
  const newMemberExpression = recast.types.builders
    .memberExpression(scopeIdentifier, path.value, false)

  traversedPaths[name] = true;

  path.replace(newMemberExpression);
  this.traverse(path)
}

function replaceGlobalIdentifier(fileAST) {
  const globalAST = Files.getFileAST('Global')[0];

  const globalNodes = globalAST.program.body.filter(node => 
    node.type === 'ExpressionStatement' 
    && node.expression.left.object.name === 'Global'
  )
  .map(node => node.expression.left.property.name)

  const traversedPaths = {}

  function addGlobalPrefix(path) {
    createNodePrefix.call(this, traversedPaths, 'Global', globalNodes, path)
  }

  recast.types.visit(fileAST, {
    visitIdentifier: addGlobalPrefix,
    // visitMemberExpression: addGlobalPrefix,
  })
}

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

function formatRequires(filename, requires) {
  if (requires.length === 0) {
    return '';
  }

  return `const { ${requires.join(', ')} } = require('./${filename}');\n`;
}

function getRequires(filename, ast) {
  const utils = importUtils(filename, ast);
  const constants = importConstants(filename, ast);

  const requires = [
    formatRequires('Constants', constants),
    formatRequires('Utils', utils)
  ]
  .filter(Boolean)
  .join('');

  return `${requires}\n`;
}

module.exports.replaceGlobalIdentifier = replaceGlobalIdentifier;
module.exports.collectIdentifiers = collectIdentifiers;
module.exports.getRequires = getRequires;