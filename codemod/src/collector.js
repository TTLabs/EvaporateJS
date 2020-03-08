const recast = require('recast');

const { IgnoredNewExpressions } = require('./constants');

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

function collectClassesDeclaration(ast) {
  const declaredClasses = new Set();

  function visitClassDeclaration(path) {
    declaredClasses.add(path)

    return this.traverse(path);
  }

  recast.visit(ast, { visitClassDeclaration }) 

  return Array.from(declaredClasses).filter(Boolean);
}

function collectClassesUsage(ast) {
  const usedClasses = new Set();

  const addUsedClass = name => !IgnoredNewExpressions.includes(name) && usedClasses.add(name);
  
  function visitClassDeclaration(path) {
    const { superClass } = path.value;
    superClass && addUsedClass(superClass.name);

    return this.traverse(path);
  }

  function visitNewExpression(path) {
    addUsedClass(path.value.callee.name)
    return this.traverse(path);
  }

  recast.visit(ast, { visitClassDeclaration, visitNewExpression }) 

  return Array.from(usedClasses).filter(Boolean);
}

module.exports.collectIdentifiers = collectIdentifiers;
module.exports.collectClassesDeclaration = collectClassesDeclaration;
module.exports.collectClassesUsage = collectClassesUsage;