const Files = require('./files');

const recast = require('recast');

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

function collectClasses(ast) {
  const IGNORED_CLASSES = ['Date', 'Promise', 'XMLHttpRequest']

  const existingClasses = new Set()

  function visitClassDeclaration(path) {
    const { superClass } = path.value;
    superClass && existingClasses.add(superClass.name);
    
    return this.traverse(path);
  }

  function visitNewExpression(path) {
    existingClasses.add(path.value.callee.name)
    return this.traverse(path);
  }

  recast.visit(ast, { visitClassDeclaration, visitNewExpression }) 

  return Array.from(existingClasses)
    .filter(Boolean)
    .filter(existing => !IGNORED_CLASSES.includes(existing));
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
  const { name: parentPathObjectName } = path.parentPath.value.object || {};

  if (!identifiers.includes(name) || parentPathObjectName === scope) {
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
    visitIdentifier: addGlobalPrefix
  })
}

module.exports.replaceGlobalIdentifier = replaceGlobalIdentifier;
module.exports.collectIdentifiers = collectIdentifiers;
module.exports.collectClasses = collectClasses;