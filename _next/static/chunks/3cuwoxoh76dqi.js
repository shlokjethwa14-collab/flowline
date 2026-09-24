(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,9579,e=>{"use strict";var t=e.i(43476),a=e.i(71645),n=e.i(8560),i=e.i(90072);let o=[{at:0,color:new i.Color("#6d58f0")},{at:.35,color:new i.Color("#4f9ff0")},{at:.7,color:new i.Color("#2fbfa0")},{at:1,color:new i.Color("#6d58f0")}],r=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`,l=`
  uniform sampler2D uScene;
  uniform vec2 uRes;      // drawing buffer, px
  uniform vec2 uCenter;   // lens centre, px, origin bottom-left
  uniform vec2 uHalf;     // half extents, px
  uniform float uRadius;  // corner radius, px
  uniform float uDpr;
  uniform vec2 uLight;    // direction the light travels, normalised
  uniform float uDark;
  varying vec2 vUv;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 frag = vUv * uRes;
    vec2 p = frag - uCenter;
    float d = sdRoundBox(p, uHalf, uRadius);

    // Outside: the field, with a soft shadow cast a little below the lens.
    vec3 outside = texture2D(uScene, vUv).rgb;
    float ds = sdRoundBox(p + vec2(0.0, 14.0 * uDpr), uHalf, uRadius);
    float shadow = (ds > 0.0 ? exp(-ds / (26.0 * uDpr)) : 1.0) * mix(0.14, 0.32, uDark);
    outside *= 1.0 - shadow;

    vec3 color = outside;

    if (d < 2.0 * uDpr) {
      float bevel = 22.0 * uDpr;
      float depth = clamp(-d / bevel, 0.0, 1.0);

      // The surface normal in the plane is the gradient of the distance field.
      vec2 e = vec2(1.0, 0.0);
      vec2 grad = vec2(
        sdRoundBox(p + e.xy, uHalf, uRadius) - sdRoundBox(p - e.xy, uHalf, uRadius),
        sdRoundBox(p + e.yx, uHalf, uRadius) - sdRoundBox(p - e.yx, uHalf, uRadius)
      );
      grad = normalize(grad + 1e-5);

      // A rounded bevel: steep at the rim, flat across the middle.
      float bend = pow(1.0 - depth, 2.4);
      vec2 refract = -grad * bend * 34.0 * uDpr;
      vec2 magnify = -p * 0.07 * depth;

      // Dispersion: each channel bends by a slightly different amount.
      vec3 lensed = vec3(
        texture2D(uScene, (frag + refract * 1.00 + magnify) / uRes).r,
        texture2D(uScene, (frag + refract * 1.14 + magnify) / uRes).g,
        texture2D(uScene, (frag + refract * 1.28 + magnify) / uRes).b
      );

      // The material: a touch more saturated, a little milk, never grey.
      float lum = dot(lensed, vec3(0.299, 0.587, 0.114));
      lensed = mix(vec3(lum), lensed, 1.2);
      lensed = mix(lensed, vec3(1.0), mix(0.1, 0.035, uDark));

      // Specular rim on the side facing the light, and the fainter far-edge
      // glow of light that travelled through the body.
      float rim = smoothstep(bevel * 0.4, 0.0, -d);
      float facing = clamp(dot(grad, -uLight) * 0.5 + 0.5, 0.0, 1.0);
      lensed += rim * pow(facing, 3.0) * mix(0.6, 0.38, uDark);
      lensed += rim * pow(1.0 - facing, 4.0) * mix(0.22, 0.14, uDark);
      lensed *= 1.0 - (1.0 - depth) * 0.05;

      float inside = smoothstep(1.5 * uDpr, -1.5 * uDpr, d);
      color = mix(outside, lensed, inside);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;e.s(["default",0,function({progressRef:e}){let u=a.useRef(null);return a.useEffect(()=>{let t=u.current;if(!t)return;let a=window.matchMedia("(prefers-reduced-motion: reduce)").matches,s=new n.WebGLRenderer({antialias:!1,alpha:!1,powerPreference:"high-performance"}),d=Math.min(window.devicePixelRatio,1.6);s.setPixelRatio(d),s.toneMapping=i.ACESFilmicToneMapping,t.appendChild(s.domElement),Object.assign(s.domElement.style,{width:"100%",height:"100%",display:"block"});let c=new i.WebGLRenderTarget(1,1,{samples:4}),h=new i.Scene,m=new i.PerspectiveCamera(42,1,.1,100),f=new i.Mesh(new i.SphereGeometry(40,32,32),new i.ShaderMaterial({side:i.BackSide,depthWrite:!1,uniforms:{uTop:{value:new i.Color("#ffffff")},uBottom:{value:new i.Color("#eef0f6")},uAccent:{value:new i.Color("#6d58f0")},uAccentStrength:{value:.35}},vertexShader:`
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 uTop;
          uniform vec3 uBottom;
          uniform vec3 uAccent;
          uniform float uAccentStrength;
          varying vec3 vPos;
          void main() {
            vec3 dir = normalize(vPos);
            float ramp = smoothstep(-0.7, 0.8, dir.y);
            vec3 base = mix(uBottom, uTop, ramp);
            // Kept below centre: the headline owns the middle of the screen.
            float bloom = pow(max(0.0, 1.0 - length(dir.xy - vec2(0.0, -0.42)) * 1.15), 2.4);
            gl_FragColor = vec4(mix(base, uAccent, bloom * uAccentStrength), 1.0);
          }
        `}));h.add(f);let v=new Float32Array(4200),p=new Float32Array(4200),g=new Float32Array(4200);for(let e=0;e<1400;e+=1){p[3*e]=(Math.random()-.5)*26,p[3*e+1]=(Math.random()-.5)*18,p[3*e+2]=(Math.random()-.5)*20;let t=Math.acos(1-2*(e+.5)/1400),a=Math.PI*(1+Math.sqrt(5))*e,n=2.1+.5*Math.random();g[3*e]=Math.cos(a)*Math.sin(t)*n,g[3*e+1]=Math.sin(a)*Math.sin(t)*n,g[3*e+2]=Math.cos(t)*n}v.set(p);let w=new i.BufferGeometry;w.setAttribute("position",new i.BufferAttribute(v,3));let x=new i.PointsMaterial({size:.06,transparent:!0,opacity:.85,depthWrite:!1,blending:i.AdditiveBlending}),y=new i.Points(w,x);h.add(y);let M=new i.ShaderMaterial({vertexShader:r,fragmentShader:l,depthTest:!1,depthWrite:!1,uniforms:{uScene:{value:c.texture},uRes:{value:new i.Vector2(1,1)},uCenter:{value:new i.Vector2(0,0)},uHalf:{value:new i.Vector2(200,80)},uRadius:{value:80},uDpr:{value:d},uLight:{value:new i.Vector2(.62,-.78).normalize()},uDark:{value:0}}}),b=new i.Mesh(new i.PlaneGeometry(2,2),M);b.frustumCulled=!1;let R=new i.Scene;R.add(b);let S=new i.OrthographicCamera(-1,1,1,-1,0,1);function A(){let e=document.documentElement.classList.contains("dark"),t=f.material.uniforms;t.uTop.value.set(e?"#0a0a11":"#f7f8ff"),t.uBottom.value.set(e?"#191932":"#e3e8fb"),t.uAccentStrength.value=e?.72:.28,x.blending=e?i.AdditiveBlending:i.NormalBlending,x.opacity=e?.85:.5,x.needsUpdate=!0,M.uniforms.uDark.value=+!!e}A();let D=new MutationObserver(A);D.observe(document.documentElement,{attributes:!0,attributeFilter:["class"]});let C={width:1,height:1},B=new i.Vector2;function P(){let{clientWidth:e,clientHeight:a}=t;0!==e&&0!==a&&(C.width=e,C.height=a,s.setSize(e,a,!1),s.getDrawingBufferSize(B),c.setSize(B.x,B.y),M.uniforms.uRes.value.copy(B),m.aspect=e/a,m.updateProjectionMatrix())}let T=new ResizeObserver(P);T.observe(t),P();let k={x:.5,y:.74,active:!1};function U(e){"touch"!==e.pointerType&&(k.x=e.clientX/Math.max(1,C.width),k.y=e.clientY/Math.max(1,C.height),k.active=!0)}window.addEventListener("pointermove",U,{passive:!0});let E={x:.5*C.width,y:.74*C.height,vx:0,vy:0},F=new i.Color,z=new i.Clock,H=0,L=e.current,q=performance.now();return H=requestAnimationFrame(function t(n){if(H=requestAnimationFrame(t),document.hidden){q=n;return}let r=Math.min(.05,(n-q)/1e3);q=n;let l=i.MathUtils.clamp(e.current,0,1);L+=(l-L)*(a?1:.08);let u=z.getElapsedTime();m.position.set(0,0,9-5.5*L),m.lookAt(0,0,0),function(e,t){for(let a=0;a<o.length-1;a+=1){let n=o[a],i=o[a+1];if(e<=i.at){let a=i.at-n.at,o=0===a?0:(e-n.at)/a;return t.copy(n.color).lerp(i.color,o)}}t.copy(o[o.length-1].color)}(L,F),x.color.copy(F),f.material.uniforms.uAccent.value.copy(F),a||(y.rotation.y=-(.03*u));let v=Math.sin(L*Math.PI),b=w.getAttribute("position"),A=b.array;for(let e=0;e<4200;e+=1)A[e]=i.MathUtils.lerp(p[e],g[e],v);b.needsUpdate=!0;let D=.5*C.width+(a?0:Math.sin(.35*u)*C.width*.04),B=.76*C.height+(a?0:8*Math.sin(.6*u)),P=k.active&&!a?D+(k.x*C.width-D)*.45:D,T=k.active&&!a?B+(k.y*C.height-B)*.18:B;a?(E.x=P,E.y=T):(E.vx+=((P-E.x)*60-11*E.vx)*r,E.vy+=((T-E.y)*60-11*E.vy)*r,E.x+=E.vx*r,E.y+=E.vy*r);let U=Math.min(C.width,C.height),O=a?0:.55*Math.sin(L*Math.PI),V=i.MathUtils.lerp(Math.min(.24*C.width,250),.11*U,O),_=i.MathUtils.lerp(Math.min(.085*C.height,72),.11*U,O),j=Math.hypot(E.vx,E.vy),G=Math.min(j/1600,.2),W=j>0?Math.abs(E.vx)/j:1;V*=1+G*W-.5*G*(1-W),_*=1+G*(1-W)-.5*G*W;let I=M.uniforms;I.uCenter.value.set(E.x*d,(C.height-E.y)*d),I.uHalf.value.set(V*d,_*d),I.uRadius.value=Math.min(V,_)*d,k.active&&!a&&I.uLight.value.set(.62+(k.x-.5)*.6,-.78).normalize(),s.setRenderTarget(c),s.render(h,m),s.setRenderTarget(null),s.render(R,S)}),()=>{cancelAnimationFrame(H),window.removeEventListener("pointermove",U),T.disconnect(),D.disconnect(),f.geometry.dispose(),f.material.dispose(),w.dispose(),x.dispose(),b.geometry.dispose(),M.dispose(),c.dispose(),s.dispose(),s.domElement.remove()}},[e]),(0,t.jsx)("div",{ref:u,className:"h-full w-full"})}])},63e3,function(e){e.n(e.i(9579))}]);