
// See gui-js/libs/shared/src/test-setup.ts for the equivalent definitions for the jest environment.

import {CppClass, events, Utility, version } from '@minsky/shared';
import { WindowManager } from './managers/WindowManager';
import { BookmarkManager } from './managers/BookmarkManager';
import { dialog, shell } from 'electron';
import * as ProgressBar from 'electron-progressbar';
import * as JSON5 from 'json5';
import * as elog from 'electron-log';
import * as path from 'path';

const log=elog? elog: console;
if (!Utility.isDevelopmentMode()) { //clobber logging in production
  log.info=function(...args: any[]){};
}

export const initialWorkingDirectory=process.cwd();
process.chdir(path.dirname(process.execPath));
const addonDir = Utility.isPackaged()
      ? '../../node-addons'
      : '../../node-addons';
/** REST Service addon */
export var restService = null;
try {
  restService = require('bindings')(addonDir+'/minskyRESTService.node');
} catch (error) {
  log.error(error);
}

/** returns true if RESTService call is logged in development mode */
function logFilter(c: string) {
  const logFilter=["mouseMove$", "requestRedraw$"];
  for (var i in logFilter)
    if (c.match(logFilter[i])) return false;
  return true;
}

/** core function to call into C++ object heirarachy */
export async function backend(command: string, ...args: any[]): Promise<any> {
  if (!command) {
    log.error('backend called without any command');
    return {};
  }
  if (!restService) {
    log.error('Rest Service not ready');
    return {};
  }
  try {
    var arg='';
    if (args.length>1) {
      arg=JSON5.stringify(args, {quote: '"'});
    } else if (args.length===1) {
      arg=JSON5.stringify(args[0], {quote: '"'});
    }
    CppClass.record(`${command} ${arg}`);

    let response=await restService.call(command, arg);
    if (logFilter(command))
      log.info('Rest API: ',command,arg,"=>",response);
    return JSON5.parse(response);
  } catch (error) {
    if (typeof(error)!=="string") error=error?.message;
    log.error('Rest API: ',command,arg,'=>Exception caught: ' + error);
    if (!dialog) throw error; // rethrow to force error in jest environment
      if (error && command !== 'minsky.canvas.item.importFromCSV')
        dialog.showMessageBoxSync(WindowManager.getMainWindow(),{
          message: error,
          type: 'error',
        });
      return error;
  }
}

export function backendSync(command: string, ...args: any[]) {
  if (!command) {
    log.error('backend called without any command');
    return {};
  }
  if (!restService) {
    log.error('Rest Service not ready');
    return {};
  }

    var arg='';
    if (args.length>1) {
      arg=JSON5.stringify(args, {quote: '"'});
    } else if (args.length===1) {
      arg=JSON5.stringify(args[0], {quote: '"'});
    }

    let response=restService.call(command+".$sync", arg);
    if (logFilter(command))
      log.info('Rest API: ',command,arg,"=>",response);
    return JSON5.parse(response);
}



CppClass.backend=backend;
CppClass.backendSync=backendSync;

const cancelButtonStyle=`
   border:0;
   line-height:1.5;
   padding:0 20px;
   font-size:1rem;
   text-align:center;
   color:#fff;
   text-shadow:1px 1px 1px;
   border-radius:10px;
   background-color:rgba(220,0,0,1);
   background-image: linear-gradient(to top left, rgba(0,0,0,0.2), rgba(0,0,0,0.2) 30%, rgba(0,0,0,0));
   box-shadow: inset 2px 2px 3px rgba(255,255,255,0.6), inset -2px -2px 3px rgba(0,0,0,0.6);
`.replace(/\n/g,'');

const cancelButton=
      `<button type="button" style="${cancelButtonStyle}" onclick="cancelMinsky()">Cancel</button>`;

const injectCancelButton=`
   function cancelMinsky() {ipcRenderer.invoke('cancel-progress');}
   const cancelButtonDiv=document.createElement("div");
   cancelButtonDiv.setAttribute('style','text-align:center;padding:5px;');
   cancelButtonDiv.innerHTML='${cancelButton}';
   document.body.appendChild(cancelButtonDiv);
`;

let progress={text:"", value:0, indeterminate: false,};
let progressBar;
let initProgressBar;

restService.setMessageCallback(function (msg: string, buttons: string[]) {
  if (msg && dialog)
    return dialog.showMessageBoxSync(WindowManager.getMainWindow(),{
      message: msg,
      type: 'info',
      buttons: buttons,
    });
  return 0;
});

restService.setBusyCursorCallback(function (busy: boolean) {
  WindowManager.getMainWindow()?.webContents?.send(events.CURSOR_BUSY, busy);
  if (!initProgressBar && busy)
    initProgressBar=setTimeout(()=>{
      progressBar=new ProgressBar(progress);
      progressBar.on('ready',()=>{progressBar._window.webContents.executeJavaScript(injectCancelButton);});
      progressBar.value=progress.value;
      initProgressBar=null;
    }, 3000);
  if (!busy) {
    clearTimeout(initProgressBar);
    initProgressBar=null;
    if (progressBar) {
      progressBar.setCompleted();
      progressBar.close();
      progressBar=null;
      progress.text="";
      progress.value=0;
    }
  }
});

restService.setProgressCallback(function (title: string, val: number) {
  progress.text=title;
  progress.value=val;
  if (progressBar && !progressBar.isCompleted())  {
    progressBar.text=title;
    progressBar.value=val;
  }
});


var bookmarkRefreshTimer;
restService.setBookmarkRefreshCallback(()=>{
  if (bookmarkRefreshTimer)
    bookmarkRefreshTimer.refresh(); // coalesce repeated calls to refreshBookmarkList
  else
    bookmarkRefreshTimer=setTimeout(()=>{
      bookmarkRefreshTimer=null;
      BookmarkManager.updateBookmarkList();
    },10);
});

// Sanity checks before we get started

export function sanityCheck()
{
  if (backendSync("minsky.minskyVersion")!==version)
    setTimeout(()=>{dialog.showMessageBoxSync({
      message: "Mismatch of front end and back end versions",
      type: 'warning',
    });},1000);

  if (backendSync("minsky.ravelExpired")) {
    setTimeout(()=>{
      const button=dialog.showMessageBoxSync({
        message: "Your Ravel license has expired",
        type: 'warning',
        buttons: ["OK","Upgrade"],
      });
      if (button==1)
        shell.openExternal("https://ravelation.hpcoders.com.au");
    },1000);
  }
}

// load icon resources needed for GUI
export function loadResources()
{
  const assetsDir=
        Utility.isDevelopmentMode() && !Utility.isPackaged()
        ? __dirname+'/assets'
        : process.resourcesPath+'/assets';

  backendSync('minsky.setGodleyIconResource',assetsDir+'/godley.svg');
  backendSync('minsky.setGroupIconResource',assetsDir+'/group.svg');
  backendSync('minsky.setRavelIconResource',assetsDir+'/ravel-logo.svg');
  backendSync('minsky.setLockIconResource',assetsDir+'/locked.svg',assetsDir+'/unlocked.svg');
  backendSync('minsky.histogramResource.setResource',assetsDir+'/histogram.svg');
}
