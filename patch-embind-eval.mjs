import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { wasmDir } from "./paths.mjs";

const files = [
  path.join(wasmDir, "chwp.mjs"),
  path.join(wasmDir, "chwp-single.mjs"),
];
const marker = "return new Function(args1,invokerFnBody)";
const emval = "var invokerFunction=new Function(Object.keys(captures),functionBody)(...Object.values(captures));";
const invokerFactory = `return function(humanName,throwBindingError,invoker,fn,runDestructors,fromRetWire,toClassParamWire){var rest=Array.prototype.slice.call(arguments,7),offset=0,stackSaveFn,stackRestoreFn;if(useStackFrame){stackSaveFn=rest[offset++];stackRestoreFn=rest[offset++]}var toArgWire=[];for(var i=0;i<argCount;++i)toArgWire.push(rest[offset++]);var argDtors=[];if(!needsDestructorStack){for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction!==null)argDtors.push(rest[offset++])}}return function(){var destructors=needsDestructorStack?[]:null,wired=[fn],var_rv;var sp=useStackFrame?stackSaveFn():0;try{if(isClassMethodFunc)wired.push(toClassParamWire(destructors,this));for(var i=0;i<argCount;++i)wired.push(toArgWire[i](destructors,arguments[i]));var_rv=invoker.apply(null,wired)}finally{if(useStackFrame)stackRestoreFn(sp)}if(needsDestructorStack)runDestructors(destructors);else{var di=0;if(isClassMethodFunc&&argTypes[1]!==null&&argTypes[1].destructorFunction!==null)argDtors[di++](wired[1]);var base=isClassMethodFunc?2:1;for(var j=2;j<argTypes.length;++j){if(argTypes[j]!==null&&argTypes[j].destructorFunction!==null)argDtors[di++](wired[base+(j-2)])}}if(returns)return fromRetWire(var_rv)}}`.replace(/var_rv/g, "rv");
const emvalInvoker = `var invokerFunction=function(handle,methodName,destructorsRef,args){var jsArgs=[];for(var i=0;i<argFromPtr.length;++i)jsArgs.push(argFromPtr[i](args+i*8));var result;if(kind===1){var fn=Emval.toValue(handle);result=fn[getStringOrSymbol(methodName)].apply(fn,jsArgs)}else if(kind===2)result=Reflect.construct(Emval.toValue(handle),jsArgs);else if(kind===0)result=Emval.toValue(handle).apply(globalThis,jsArgs);else result=jsArgs.length?jsArgs[jsArgs.length-1]:void 0;if(!retType.isVoid)return emval_returnValue(toReturnWire,destructorsRef,result)};`;

for (const file of files) {
  if (!existsSync(file)) continue;
  const label = path.basename(file);
  let code = readFileSync(file, "utf8");
  const staleEmval = "var fn=Emval.toValue(handle),result;if(kind===1)result=fn[getStringOrSymbol(methodName)].apply(fn,jsArgs);else if(kind===2)result=Reflect.construct(fn,jsArgs);else if(kind===0)result=fn.apply(void 0,jsArgs);";
  if (code.includes(staleEmval)) {
    code = code.replace(staleEmval, "var result;if(kind===1){var fn=Emval.toValue(handle);result=fn[getStringOrSymbol(methodName)].apply(fn,jsArgs)}else if(kind===2)result=Reflect.construct(Emval.toValue(handle),jsArgs);else if(kind===0)result=Emval.toValue(handle).apply(globalThis,jsArgs);");
    writeFileSync(file, code);
    console.log(`[${label}] embind cast invoker fixed`);
  }
  if (!code.includes(marker) && code.includes("stackSaveFn")) {
    console.log(`[${label}] embind eval patch already applied`);
    continue;
  }
  if (!code.includes(marker) || !code.includes(emval)) {
    throw new Error(`[${label}] embind new Function pattern missing`);
  }
  code = code.replace(marker, invokerFactory).replace(emval, emvalInvoker);
  if (code.includes("new Function")) {
    throw new Error(`[${label}] new Function remains after patch`);
  }
  writeFileSync(file, code);
  console.log(`[${label}] embind eval patch applied`);
}
