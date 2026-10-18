import {readFile,writeFile,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const [bundle,screen]=process.argv.slice(2);
if(process.platform!=='darwin'||process.env.GITHUB_ACTIONS!=='true'||!bundle.endsWith('/Karpservice-Screenshots.app')||!['shop','groups','checkout'].includes(screen))throw Error('Simulator capture only');
if(execFileSync('/usr/libexec/PlistBuddy',['-c','Print :DTPlatformName',join(bundle,'Info.plist')],{encoding:'utf8'}).trim()!=='iphonesimulator')throw Error('Wrong platform');
const dir=join(bundle,'public'),template=join(dir,'index.screenshot-original');
let html;try{html=await readFile(template,'utf8')}catch{html=await readFile(join(dir,'index.html'),'utf8');await writeFile(template,html);}
await cp('screenshots/store-fixture.js',join(dir,'store-fixture.js'));
await writeFile(join(dir,'store-screen.js'),'window.KarpScreenshotScreen='+JSON.stringify(screen)+';');
html=html.replace('<script src="native.js"></script>','<script src="native.js"></script><script src="store-screen.js"></script><script src="store-fixture.js"></script>');
await writeFile(join(dir,'index.html'),html);
