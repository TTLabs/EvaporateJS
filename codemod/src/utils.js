const recast = require('recast');

const Files = require('./files');

const getFileFunctions = file => Files
  .getFileAST(file)
  .map(func => func.id.name);

const getConstants = () => Files
  .getFileAST('Constants')
  .map(variable => variable.declarations[0])
  .map(variable => variable.id.name);

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

  const { object: parentPathObject = {} } = path.parentPath.value;

  const shouldSkip = (
    !identifiers.includes(name) 
    || parentPathObject.name === scope
    || path.parentPath.name === 'params'
  )

  if (shouldSkip) {
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

function addGlobalPrefix(fileAST) {
  const globalAST = Files.getFileAST('Global')[0];

  const globalNodes = globalAST.program.body.filter(node => 
    node.type === 'ExpressionStatement' 
    && node.expression.left.object.name === 'Global'
  )
  .map(node => node.expression.left.property.name)

  const prefixedIdentifiers = {}

  function prefix(path) {
    createNodePrefix.call(this, prefixedIdentifiers, 'Global', globalNodes, path)
  }

  recast.types.visit(fileAST, {
    visitIdentifier: prefix
  })

  return Object.keys(prefixedIdentifiers);
}

module.exports.addGlobalPrefix = addGlobalPrefix;

module.exports.getFileFunctions = getFileFunctions;
module.exports.getConstants = getConstants;