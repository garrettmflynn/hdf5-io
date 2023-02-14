
// ------------ Get All Property Names ------------

import { ArbitraryObject } from "../types";
import { isBigInt } from "../globals";

const rawProperties: ArbitraryObject = {}
const globalObjects = [
    'Object', 
    'Array', 
    'Map', 
    'Set', 
    'Number', 
    'Boolean', 
    'String',
    'Date',
    'RegExp',
    'Function',
    'Promise',
    'Symbol',
    'BigInt',
    'Error',
    'Float32Array',
    'Float64Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Uint8Array',
    'Uint16Array',
    'Uint32Array',
    'Uint8ClampedArray',
    'ArrayBuffer',
    'SharedArrayBuffer',
]

export function getAllPropertyNames( obj: any ) {

    var props: string[] = [];
    if (obj) {
        do {

            const name = obj.constructor?.name 
            const isGlobalObject = globalObjects.includes(name)
            if (globalObjects.includes(name)) {
                if (!rawProperties[name]) rawProperties[name] = [...Object.getOwnPropertyNames((globalThis as any)[name].prototype)]
            }

            Object.getOwnPropertyNames( obj ).forEach(function ( prop ) {
                if (prop === 'constructor') return; // Skip constructor
                if (isGlobalObject && rawProperties[name].includes(prop)) return; // Skip inbuilt class prototypes
                if ( props.indexOf( prop ) === -1 ) props.push( prop )
            });
        } while ( obj = Object.getPrototypeOf( obj ));
    }

    return props;
}

export type extendedObject = (String | Number | Boolean | Object) & {[x:string | symbol]: any}
// Create an object from a value. Since some of the standard class properties may be overwritten, we have to create an extended class.
export const objectify = (value: any) => {
    const typeOf = typeof value
    let resolvedValue: extendedObject = value
    if (typeOf === 'string') resolvedValue = new String(resolvedValue)
    else if (typeOf === 'number') resolvedValue = new Number(resolvedValue)
    else if (typeOf === 'bigint') { // Convert bigints
        resolvedValue = new Number(resolvedValue)
        Object.defineProperty(resolvedValue, isBigInt, {value, writable: false}) // Store OG BigInt
    }
    else if (typeOf === 'boolean') resolvedValue = new Boolean(resolvedValue)
    return resolvedValue
}


// // Extend a base classes
// export const extend = (name, baseClass) => {
//     return {
//         [name]: class cls extends baseClass {
//                 constructor(...args) {
//                     super(...args)
//                 }
//             }
//     }[name]
// }