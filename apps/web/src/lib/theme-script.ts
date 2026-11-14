import { THEME_STORAGE_KEY, palettes } from '@fatia/design';

/**
 * Script inline do <head> (ADR 041): aplica o tema antes da primeira pintura,
 * sem esperar o React, para não piscar o escuro numa página clara.
 *
 * Grava no <html> o tema resolvido (`data-theme`, que o CSS e o `dark:` do
 * Tailwind leem) e a preferência (`data-theme-preference`). Com "Sistema",
 * acompanha a troca do sistema enquanto a página está aberta. O localStorage
 * pode estar bloqueado (aba privada, site bloqueado): aí vale o sistema.
 *
 * É string, e não função serializada, para continuar válido depois do minify.
 */
export const THEME_SCRIPT = `(function(){
var d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},p='system';
try{var v=localStorage.getItem(k);if(v==='dark'||v==='light'||v==='system')p=v;}catch(e){}
var m=window.matchMedia?window.matchMedia('(prefers-color-scheme: light)'):null;
function apply(){var t=p==='system'?(m&&m.matches?'light':'dark'):p;d.dataset.theme=t;d.dataset.themePreference=p;d.style.colorScheme=t;
var c=t==='light'?${JSON.stringify(palettes.light.background)}:${JSON.stringify(palettes.dark.background)};
var ms=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<ms.length;i++)ms[i].setAttribute('content',c);}
apply();
if(m&&m.addEventListener)m.addEventListener('change',function(){if(d.dataset.themePreference==='system')apply();});
})();`;
