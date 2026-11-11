// Regenerate only after reviewing the migration sequence. Default is a read-only check.
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import process from 'node:process';
import console from 'node:console';
const directory=new URL('../supabase/migrations/',import.meta.url);
const target=new URL('../src/backend/staging-schema-bundle.generated.ts',import.meta.url);
const names=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
const files=[];
for(const name of names){const sql=(await readFile(new URL(name,directory),'utf8')).replaceAll('\r\n','\n');files.push({name,sql,sha256:createHash('sha256').update(sql).digest('hex')});}
const text='// Reviewed migration bytes generated from supabase/migrations. Regenerate deliberately when migrations change.\nexport const stagingSchemaBundle = '+JSON.stringify({format:'azzora-staging-schema-bundle-v1',files},null,2)+' as const;\n';
// Never overwrite an existing reviewed bundle: old archives need its exact catalog.
if(process.argv.includes('--write'))await writeFile(target,text,{flag:'wx'});
else if((await readFile(target,'utf8')).replaceAll('\r\n','\n')!==text)throw Error('Reviewed staging schema bundle differs from migration source.');
console.log(`Staging schema bundle matches ${files.length} migration files.`);
