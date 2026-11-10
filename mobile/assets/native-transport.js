/* Native API transport only. Firebase/Wikimedia/local files keep ordinary fetch.
   Abort stops delivery to the view; it cannot cancel a server action already received.
   Never automatically replay a credit-consuming request. */
(function () {
  const cap=window.Capacitor;
  if(!cap?.isNativePlatform?.())return;
  window.knoxNativeApp=true;
  document.documentElement.classList.add('native-app');
  if(cap.getPlatform?.()==='ios')document.documentElement.classList.add('native-ios');
  if(!cap.Plugins?.FirebaseAuthentication)cap.registerPlugin('FirebaseAuthentication');
  const original=window.fetch.bind(window), base=window.knoxMobileConfig.apiOrigin;
  const local=new URL(location.href);
  const http=cap.Plugins?.CapacitorHttp || cap.registerPlugin('CapacitorHttp');
  window.fetch=async function(input, init={}) {
    const request=input instanceof Request?input:null;
    const url=new URL(request?.url || String(input),location.href);
    if(url.protocol!==local.protocol || url.host!==local.host || !url.pathname.startsWith('/api/')) return original(input,init);
    const signal=init.signal || request?.signal;
    if(signal?.aborted)throw signal.reason || new DOMException('Aborted','AbortError');
    const headers=new Headers(request?.headers);new Headers(init.headers).forEach((v,k)=>headers.set(k,v));
    const method=String(init.method || request?.method || 'GET').toUpperCase();
    const body=init.body!==undefined?init.body:request && !['GET','HEAD'].includes(method)?await request.clone().text():undefined;
    if(body!=null && typeof body!=='string')throw new TypeError('Knox API requests must use JSON text.');
    if(signal?.aborted)throw signal.reason || new DOMException('Aborted','AbortError');
    const target=new URL(url.pathname+url.search,base);
    return new Promise((resolve,reject)=>{
      let finished=false;
      const settle=(fn,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',abort);fn(value);};
      const abort=()=>settle(reject,signal.reason || new DOMException('Aborted','AbortError'));
      signal?.addEventListener('abort',abort,{once:true});
      http.request({url:target.href,method,headers:Object.fromEntries(headers),data:body,
        // iOS uses connectTimeout as the URLSession request timeout too. Keep
        // it long enough for photo/deck generation; each caller's signal can
        // still stop waiting sooner (without replaying the server operation).
        responseType:'text',readTimeout:70000,connectTimeout:70000,disableRedirects:true})
        .then(result=>{
          const payload=result.data==null?'':typeof result.data==='string'?result.data:JSON.stringify(result.data);
          settle(resolve,new Response([204,205,304].includes(result.status)?null:payload,{status:result.status,headers:result.headers}));
        }).catch(()=>settle(reject,new TypeError('Could not reach Knox. Check your connection.')));
    });
  };
})();
