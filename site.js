/* Tech and Support - all site scripts in one file. Each block only runs on the page that needs it. */
/* Google Analytics 4 (only on the live site, never when opened from a folder) */
(function () {
  'use strict';
  var id = 'G-6P15W4SNX3';
  if (!/^https?:$/.test(location.protocol)) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id);
})();

/* Tech and Support - shared behaviour: mobile menu, services dropdown, scroll reveal, counters */
(function () {
  'use strict';
  var menu = document.querySelector('.menu');
  var nav = document.getElementById('nav');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
  }

  var sb = document.querySelector('.hd');
  var chev = sb && sb.querySelector('.chev');
  if (sb && chev) {
    var closeMenu = function () {
      sb.classList.remove('open');
      chev.setAttribute('aria-expanded', 'false');
    };
    chev.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = sb.classList.toggle('open');
      chev.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (!sb.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  function count(el) {
    var target = +el.dataset.n, decimals = +el.dataset.d || 0, suffix = el.dataset.s || '', start = null;
    function frame(ts) {
      start = start || ts;
      var p = Math.min((ts - start) / 1400, 1);
      el.textContent = (target * (1 - Math.pow(1 - p, 3))).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var items = document.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window)) {
    /* Very old browsers: show everything immediately. */
    items.forEach(function (el) { el.classList.add('on'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (x) {
      if (!x.isIntersecting) return;
      x.target.classList.add('on');
      var c = x.target.querySelector('[data-n]');
      if (c && !reduceMotion) count(c);
      io.unobserve(x.target);
    });
  }, { threshold: 0.15 });
  items.forEach(function (el, i) {
    el.style.transitionDelay = (i % 4) * 70 + 'ms';
    io.observe(el);
  });
})();

/* Home page: pause the hero visual when it is off screen */
(function () {
  'use strict';
  var v = document.querySelector('.viz');
  if (!v || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(function (e) {
    v.classList.toggle('off', !e[0].isIntersecting);
  }).observe(v);
})();

/* Services page: highlight the section currently in view in the sticky section nav */
(function () {
  'use strict';
  var links = [].slice.call(document.querySelectorAll('.snav a'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  var map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.classList.remove('on'); });
      var a = map[e.target.id];
      if (a) {
        a.classList.add('on');
        var w = a.parentNode;
        w.scrollTo({ left: a.offsetLeft - w.clientWidth / 3, behavior: 'smooth' });
      }
    });
  }, { rootMargin: '-35% 0px -55% 0px' });
  Object.keys(map).forEach(function (id) {
    var e = document.getElementById(id);
    if (e) io.observe(e);
  });
})();

/* Contact page: enquiry form submission to the /send-enquiry Worker endpoint */
(function () {
  'use strict';
  var form = document.getElementById('cf');
  var status = document.getElementById('fs');
  var requirement = document.getElementById('f-req');
  var nameField = document.getElementById('f-name');
  var emailField = document.getElementById('f-em');
  if (!form || !status || !requirement || !nameField || !emailField) return;

  /* Buttons elsewhere on the page can pre-select a requirement. */
  document.querySelectorAll('[data-req]').forEach(function (a) {
    a.addEventListener('click', function () {
      requirement.value = a.dataset.req;
      setTimeout(function () { nameField.focus({ preventScroll: true }); }, 400);
    });
  });

  function setStatus(kind, message) {
    status.className = kind ? 'fnote ' + kind : 'fnote';
    status.textContent = message;
  }
  function flag(field, bad) {
    field.classList.toggle('bad', bad);
    field.setAttribute('aria-invalid', bad ? 'true' : 'false');
  }

  var emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var fallback = 'Unable to send your request. Please try again or email info@techandsupport.com.';

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var nameOk = nameField.value.trim() !== '';
    var emailOk = emailPattern.test(emailField.value.trim());
    flag(nameField, !nameOk);
    flag(emailField, !emailOk);
    if (!nameOk || !emailOk) {
      setStatus('err', 'Please enter your name and a valid business email.');
      (nameOk ? emailField : nameField).focus();
      return;
    }

    var button = form.querySelector('button[type=submit]');
    button.disabled = true;
    setStatus('', 'Sending your request...');

    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 20000) : null;

    fetch(form.getAttribute('action'), {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    })
      .then(function (r) {
        return r.json().then(
          function (data) { return { ok: r.ok, data: data }; },
          function () { throw new Error('The server returned an invalid response. Please try again later.'); }
        );
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          form.reset();
          setStatus('ok', 'Thank you. Your request has been submitted successfully.');
        } else {
          setStatus('err', (result.data && result.data.error) || fallback);
        }
      })
      .catch(function (err) {
        var timedOut = err && err.name === 'AbortError';
        setStatus('err', timedOut
          ? 'The request timed out. Please try again or email info@techandsupport.com.'
          : (err && err.message) || fallback);
      })
      .then(function () {
        if (timer) clearTimeout(timer);
        button.disabled = false;
      });
  });
})();

/* Careers page: renders live openings. Add one object per role to OPENINGS; leave [] when there are none.
   Example: {position:"Network Engineer",location:"Jodhpur",experience:"3-5 years",skills:["Cisco","Fortinet","SD-WAN"],responsibilities:["Manage LAN/WAN","Support firewalls"]} */
(function(){var OPENINGS=[];var box=document.getElementById('jobs');if(!box)return;
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
if(!OPENINGS.length){var e=el('div','empty');e.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/></svg>';var d=el('div');d.appendChild(el('h3',null,'No openings are listed right now'));var p=el('p',null,'Send us your profile and we will contact you about future opportunities. ');var a=el('a',null,'Submit your resume');a.href='#resume';p.appendChild(a);d.appendChild(p);e.appendChild(d);box.appendChild(e)}
OPENINGS.forEach(function(j){var c=el('article','job'),l=el('div');l.appendChild(el('h3',null,j.position));var m=el('div','jm');[['Location',j.location],['Experience',j.experience]].forEach(function(k){var s=el('span');s.appendChild(el('b',null,k[0]+': '));s.appendChild(document.createTextNode(k[1]||''));m.appendChild(s)});l.appendChild(m);var v=el('div','vals vend');(j.skills||[]).forEach(function(x){v.appendChild(el('span',null,x))});l.appendChild(v);var u=el('ul');(j.responsibilities||[]).forEach(function(x){u.appendChild(el('li',null,x))});l.appendChild(u);var a=el('a','btn b1','Apply');a.href='mailto:hr@techandsupport.com?subject='+encodeURIComponent('Application: '+j.position);c.appendChild(l);c.appendChild(a);box.appendChild(c)})})();

/* Technology partners page: rotating ecosystem diagram */
(function(){var svg=document.getElementById("ecoViz");if(!svg)return;var nodes=svg.querySelectorAll(".on"),spokes=svg.querySelectorAll(".spoke"),poly=svg.querySelector(".poly");if(!nodes.length||(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches))return;var CX=230,CY=190,R=142,SPEED=9,ang=0,last=null,run=true,visible=true;function draw(){var pts=[];for(var i=0;i<nodes.length;i++){var a=(-90+i*45+ang)*Math.PI/180,x=CX+R*Math.cos(a),y=CY+R*Math.sin(a);nodes[i].setAttribute("transform","translate("+x.toFixed(1)+","+y.toFixed(1)+")");spokes[i].setAttribute("x2",x.toFixed(1));spokes[i].setAttribute("y2",y.toFixed(1));pts.push(x.toFixed(1)+","+y.toFixed(1))}poly.setAttribute("points",pts.join(" "))}function tick(t){if(last===null)last=t;var dt=(t-last)/1000;last=t;if(run&&visible){ang=(ang+SPEED*dt)%360;draw()}requestAnimationFrame(tick)}svg.addEventListener("mouseenter",function(){run=false});svg.addEventListener("mouseleave",function(){run=true});if("IntersectionObserver" in window){new IntersectionObserver(function(e){visible=e[0].isIntersecting}).observe(svg)}requestAnimationFrame(tick)})();
