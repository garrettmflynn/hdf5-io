import * as h5 from 'h5wasm'

const path = 'hdf5-test'
const name = 'FergusonEtAl2015'
const filename = `${name}.nwb`


// This standalone version of the Jest test works just fine...
const run = async () => {

    // the WASM loads asychronously, and you can get the module like this:
    const Module = await h5.ready;

    // then you can get the FileSystem object from the Module:
    const { FS } = Module;

    // FS.mkdir(path);
    // FS.chdir(path);
    const fullpath = `/Users/garrettflynn/Documents/Github/hdf5-io/hdf5-test/FergusonEtAl2015.nwb`
    const constructed = `${process.cwd()}/${path}/${filename}`
    console.log('constructed', constructed, constructed === fullpath)

    let attr

    let group;
    
    const readFile = () => {
        console.log('------------------ read file ------------------')
    let read = new h5.File(constructed, "r");
        try {

            const readAttrs = (group) => {
                const attrs = Object.keys(group.attrs)
                attrs.forEach(name => {
                    attr = group.get_attribute(name);
                    console.log(`${group.path}/${name}`, attr);
                })
            }

            readAttrs(read)

            const keys = read.keys()
            keys.forEach(key => {
                group = read.get(key)
                readAttrs(group)
            })
        } catch (e) {
            console.error(e)
        }
        read.close()
    }

    readFile()

    let write = new h5.File(constructed, "w");

    if (write) {
        const value = attr === undefined ? 0 : attr + 1
        write.create_attribute("new_attr", value);
        write.create_attribute("anotherattr", 'what');
        const g = write.create_group("new_group");
        g.create_attribute("nested", 'nested');
        write.close()
    }

    readFile()

    // const f2 = new h5.File(`${path}/${filename}`, "r");
    // const attr = f2.get_attribute("new_attr");
    // console.log(attr);
    // f2.close()

    // const f3 = new h5.File(`${path}/${filename}`, "r");
    // const attr2 = f3.get_attribute("new_attr");
    // console.log(attr2);
    // f3.close()


}

run()