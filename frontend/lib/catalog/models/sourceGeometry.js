/**
 * Visible-topology interpretations of the reviewed sourceConstructions registry.
 * Every dimension is an arbitrary scene proportion, never a real product dimension.
 * Closed shells remain closed. Open/cutaway sources are explicitly identified in the
 * evidence map; only their visible major components are drawn, without hidden wiring.
 */
function primitives(api) {
  const { group, box, cylinder, insulator, handle, display, warning, vents } = api;
  const part = (name, build) => {
    const start = group.children.length;
    build();
    for (const item of group.children.slice(start)) if (!item.name) item.name = name;
  };
  const place = (at, build, scale = 1, rotateY = 0) => {
    const start = group.children.length;
    build();
    const c = Math.cos(rotateY), s = Math.sin(rotateY);
    for (const item of group.children.slice(start)) {
      const { x, y, z } = item.position;
      item.position.set(at[0] + (x * c + z * s) * scale, at[1] + y * scale, at[2] + (z * c - x * s) * scale);
      item.scale.multiplyScalar(scale);
      item.rotation.y += rotateY;
    }
  };
  const shell = (w, h, d, at = [0, 0, 0]) => place(at, () => part('closed-shell', () => {
    box([w, h, d], [0, h / 2 + .12, 0], 'body', true);
    box([w + .04, .12, d + .04], [0, .1, 0], 'frame');
  }));
  const door = (x, y, z, w, h, controls = false) => part('door', () => {
    box([w, h, .045], [x, y, z], 'panel', true);
    handle(x + w * .33, y, z + .04);
    for (const dy of [-h * .34, h * .34]) box([.035, .09, .055], [x - w / 2 + .03, y + dy, z + .02], 'frame');
    if (controls) display(x - w * .15, y + h * .2, z + .04, Math.min(.3, w * .36));
  });
  const frame = (w, h, d, at = [0, 0, 0]) => place(at, () => part('open-frame', () => {
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) box([.055, h, .055], [x, h / 2, z], 'frame');
    for (const y of [0, h]) {
      for (const z of [-d / 2, d / 2]) box([w, .055, .055], [0, y, z], 'frame');
      for (const x of [-w / 2, w / 2]) box([.055, .055, d], [x, y, 0], 'frame');
    }
  }));
  const grille = (w, h, x, y, z) => part('protective-mesh', () => {
    for (let i = 0; i <= 7; i++) box([.018, h, .02], [x - w / 2 + w * i / 7, y, z], 'frame');
    for (let i = 0; i <= 6; i++) box([w, .018, .02], [x, y - h / 2 + h * i / 6, z], 'frame');
  });
  const gable = (w, d, y, x = 0, z = 0) => part('pitched-roof', () => {
    const rise = .16;
    for (const side of [-1, 1]) {
      const plane = box([w / 2 + .1, .07, d + .14], [x + side * w / 4, y + rise / 2, z], 'frame', true);
      plane.rotation.z = -side * Math.atan2(rise, w / 2);
    }
  });
  const tank = (at, w = 1, h = 1, d = .8, inputs = 0, ribbed = false) => place(at, () => part('visible-transformer-tank', () => {
    box([w, h, d], [0, h / 2, 0], 'body', true);
    box([w + .08, .07, d + .08], [0, h + .02, 0], 'frame');
    if (ribbed) for (const z of [-d / 2 - .03, d / 2 + .03]) for (let i = 0; i < 9; i++) box([.045, h * .85, .1], [-w * .44 + w * .11 * i, h / 2, z], 'frame');
    for (let i = 0; i < inputs; i++) insulator(inputs === 1 ? 0 : -w * .3 + i * w * .6 / (inputs - 1), h + .06, 0, .65);
  }));
  const skids = (w, d) => part('skids', () => {
    for (const z of [-d / 2, d / 2]) box([w, .15, .16], [0, .1, z], 'frame', true);
  });
  const steps = (x, y, z, count = 5, direction = 1) => part('access-steps', () => {
    for (let i = 0; i < count; i++) box([.55, .05, .2], [x, y - i * .14, z + direction * i * .16], 'frame');
    for (const dx of [-.28, .28]) {
      const rail = box([.03, .03, count * .22], [x + dx, y + .35 - count * .07, z + direction * count * .08], 'frame');
      rail.rotation.x = direction * .7;
      box([.03, .4, .03], [x + dx, y + .2, z], 'frame');
    }
  });
  const relay = (x, y, z, w = 1) => part('relay-fascia', () => {
    box([w, .62, .04], [x, y, z], 'panel', true);
    display(x - .22 * w, y + .12, z + .035, .23 * w);
    box([.15, .2, .02], [x + .23 * w, y + .11, z + .035], 'dark');
    for (let i = 0; i < 5; i++) {
      const button = cylinder(.022, .018, [x - .23 + i * .11, y - .15, z + .035], 'dark');
      button.rotation.x = Math.PI / 2;
    }
  });
  const sideInput = (x, y, z, direction = 1, scale = .8) => part('side-input', () => {
    const start = group.children.length;
    insulator(0, 0, 0, scale);
    for (const item of group.children.slice(start)) {
      const p = item.position.clone();
      item.position.set(x + direction * p.y, y - direction * p.x, z + p.z);
      item.rotation.z = -direction * Math.PI / 2;
    }
  });
  return { ...api, part, place, shell, door, frame, grille, gable, tank, skids, steps, relay, sideInput };
}

const constructions = {
  'mesh-top-relay-switchgear': p => {
    const { shell, box, grille, relay, door, warning } = p;
    shell(1.05, 2.7, 1.1);
    box([1.12, .07, 1.14], [0, 2.88, 0], 'frame');
    grille(.91, .36, 0, 2.6, .582);
    relay(0, 1.92, .588, .91);
    box([.29, .32, .035], [0, 1.77, .628], 'glass');
    door(0, .75, .587, .86, 1.04); warning(0, .86, .618, .11);
  },
  'relay-panel-switchgear': p => {
    p.shell(.95, 2.7, 1.15);
    p.relay(0, 2.48, .603, .84);
    p.door(0, 1.18, .608, .84, 1.87);
    p.warning(0, 1.58, .635, .1);
    p.box([.23, .07, .02], [0, 1.95, .638], 'dark');
  },
  'double-kiosk-substation': p => {
    for (const x of [-1.67, 1.67]) {
      p.shell(2.3, 1.9, 1.8, [x, 0, 0]);
      p.box([2.43, .1, 1.94], [x, 2.07, 0], 'frame', true);
      for (const dx of [-.47, .47]) p.door(x + dx, 1.08, .934, .79, 1.64);
      p.vents(x - .47, 1.54, .965, .57, 3);
      p.warning(x + .47, 1.58, .963, .1);
    }
    p.shell(.64, 1.02, .58, [0, .02, .6]);
    p.door(0, .63, .917, .55, .87);
    p.warning(0, .84, .95, .075);
  },
  'tall-single-phase-substation': p => {
    p.shell(.85, 2.8, 1.06);
    p.box([.93, .07, 1.14], [0, 2.98, 0], 'frame');
    for (const [y, h] of [[.66, .89], [1.7, 1.08]]) p.door(0, y, .56, .74, h);
    p.box([.74, .59, .045], [0, 2.65, .56], 'panel', true);
    p.warning(0, 1.77, .594, .17);
    p.box([.23, .12, .025], [0, .72, .594], 'dark');
    for (const x of [-.29, .29]) p.insulator(x, 3.02, 0, .65);
  },
  'heating-transformer-assembly': p => {
    p.skids(1.45, 1.65);
    p.tank([0, .27, -.33], 1.15, 1.19, .82);
    p.shell(1.24, 1.52, .26, [0, .15, .65]);
    p.door(0, 1.02, .81, 1.1, 1.37);
    p.box([.19, .17, .02], [0, 1.4, .839], 'dark');
    p.warning(0, 1.05, .84, .11);
    p.box([1.33, .08, .36], [0, 1.86, .65], 'frame');
  },
  'raised-outdoor-substation': p => {
    p.box([2.5, .18, 2.3], [0, .12, 0], 'frame', true);
    p.frame(2, 1.2, 1.9, [0, .23, 0]);
    p.box([2.2, .1, 2.05], [0, 1.46, 0], 'frame');
    p.tank([.2, 1.52, .13], 1.08, .96, 1, 3, true);
    for (const x of [-.98, .98]) p.box([.08, 2.12, .08], [x, 2.49, -.7], 'frame');
    p.box([2.13, .1, .6], [0, 3.5, -.71], 'frame');
    for (const x of [-.66, 0, .66]) p.insulator(x, 3.56, -.7, 1);
    p.part('platform-railing', () => {
      for (const y of [1.65, 2.13, 2.56]) p.box([2.12, .04, .04], [0, y, 1], 'frame');
      for (const x of [-1.04, 1.04]) p.box([.045, 1.08, .045], [x, 2.05, 1], 'frame');
      for (const y of [1.65, 2.13, 2.56]) p.box([.04, .04, 1.93], [-1.04, y, 0], 'frame');
    });
    p.part('access-ladder', () => {
      for (const x of [.61, 1.04]) p.box([.04, 2.38, .04], [x, 1.45, 1.15], 'frame');
      for (let i = 0; i < 9; i++) p.box([.44, .03, .035], [.825, .43 + i * .22, 1.15], 'frame');
    });
    p.shell(.44, .67, .3, [-.2, .22, 1.03]);
  },
  'single-phase-pole-substation': p => {
    p.cylinder(.09, 4.2, [0, 2.1, 0], 'frame');
    p.box([1.16, .065, .25], [-.44, 4.03, 0], 'frame');
    for (const x of [-.94, -.38]) p.insulator(x, 4.07, 0, .42);
    p.tank([-.6, 1.85, 0], .52, .71, .5);
    p.sideInput(-.86, 2.46, 0, -1, .56);
    p.box([.96, .07, .65], [-.38, 1.79, 0], 'frame');
    for (const [x, y, h, angle] of [[-.36, 3.73, .83, -.8], [-.3, 1.55, .7, -.85]]) {
      const brace = p.box([.04, h, .04], [x, y, 0], 'frame'); brace.rotation.z = angle;
    }
    p.shell(.35, .55, .32, [.21, .55, 0]);
    p.door(.21, .95, .188, .28, .45);
    p.sideInput(-.06, 3.03, 0, -1, .55);
  },
  'open-vacuum-switchgear': p => {
    p.frame(1.55, 2.15, .87, [0, .15, 0]);
    p.box([1.51, .12, .85], [0, .23, 0], 'frame');
    p.part('visible-cutaway-apparatus', () => {
      for (const x of [-.5, 0, .5]) {
        p.cylinder(.13, 1, [x, .93, 0], 'red');
        p.insulator(x, 1.46, 0, .96);
        p.box([.28, .13, .37], [x, .39, 0], 'frame');
      }
      for (const y of [.48, 1.47]) p.box([1.56, .09, .62], [0, y, 0], 'frame');
    });
    p.shell(.3, 2.55, 1, [.98, 0, 0]);
    p.relay(.98, 2.28, .53, .3);
  },
  'rmu-three-cell-lineup': p => {
    for (const x of [-.83, 0, .83]) {
      p.shell(.81, 2.25, .9, [x, 0, 0]);
      p.door(x, .63, .484, .71, .88);
      p.box([.73, .64, .05], [x, 1.47, .487], 'panel', true);
      p.display(x - .13, 1.55, .532, .21);
      for (const y of [1.28, 1.63]) p.box([.16, .05, .05], [x + .2, y, .541], 'dark');
      p.box([.73, .42, .05], [x, 2.13, .487], 'body', true);
    }
  },
  'outdoor-roof-input-switchgear': p => {
    p.shell(.98, 2.62, 1.46);
    p.door(0, .93, .763, .86, 1.33);
    p.door(0, 2.12, .763, .86, .93);
    p.box([.39, .14, .025], [0, 2.35, .798], 'dark');
    const roof = p.box([1.1, .08, 1.61], [0, 2.83, 0], 'frame'); roof.rotation.x = .035;
    for (const x of [-.33, 0, .33]) p.insulator(x, 2.9, -.19, .64);
    p.box([.12, .38, .73], [.55, 2.55, -.23], 'body', true);
  },
  'open-sided-distribution-panel': p => {
    p.frame(.95, 2.7, .84, [0, .1, 0]);
    p.door(0, 1.45, .456, .85, 2.53);
    p.display(0, 1.94, .495, .43);
    for (const x of [-.27, -.09, .09, .27]) p.box([.1, .08, .028], [x, 2.57, .494], 'dark');
    // Side braces only: the other panel pictured on p35 is not this construction.
    for (const x of [-.475, .475]) p.box([.055, .055, .82], [x, 1.34, 0], 'frame');
  },
  'single-modular-building': p => {
    p.shell(3.2, 1.54, 1.85);
    p.gable(3.33, 1.9, 1.75);
    for (const x of [-1.04, -.37]) p.door(x, .93, .957, .62, 1.4);
    p.door(.93, .84, .957, .57, 1.24);
    for (const x of [-1.48, .36, 1.48]) p.box([.045, 1.52, .035], [x, .91, .949], 'frame');
  },
  'double-modular-building': p => {
    p.shell(3.5, 1.53, 2.3);
    p.gable(3.62, 2.35, 1.74);
    for (const x of [-1.67, -.58, .58, 1.67]) p.box([.05, 1.54, 2.34], [x, .92, 0], 'frame');
    p.door(0, .8, 1.18, .61, 1.2);
    p.box([.69, .24, .04], [0, 1.55, 1.18], 'body', true);
  },
  'concrete-substation-building': p => {
    p.shell(3.65, 1.72, 2.28);
    p.box([3.83, .11, 2.45], [0, 1.94, 0], 'dark', true);
    for (const x of [-1.43, -.47, .47, 1.43]) {
      p.door(x, 1, 1.171, x === -.47 || x === .47 ? .87 : .56, 1.54);
      if (Math.abs(x) < 1) { p.vents(x, .37, 1.207, .57, 3); p.vents(x, 1.49, 1.207, .57, 3); }
    }
    p.box([.022, .46, 2.27], [1.837, 1, 0], 'frame');
  },
  'deep-35kv-switchgear': p => {
    p.shell(1.12, 2.62, 2.6);
    p.relay(0, 2.4, 1.33, 1);
    p.door(0, 1.08, 1.333, 1, 1.68);
    for (const y of [.82, 1.22]) p.box([.07, .07, .03], [y === .82 ? -.13 : .12, y, 1.365], 'dark');
    for (const z of [-.45, .46]) p.box([.018, 2.52, .018], [.565, 1.43, z], 'frame');
  },
  'open-drawout-switchgear': p => {
    p.frame(.97, 2.56, 1.62, [0, .12, 0]);
    p.box([.92, .05, 1.56], [0, .15, 0], 'frame');
    p.box([.92, .83, .51], [0, 2.25, .55], 'body', true);
    p.relay(0, 2.28, .831, .84);
    p.part('visible-drawout-trolley', () => {
      p.box([.73, .13, .94], [0, .34, .17], 'frame', true);
      p.box([.68, .56, .18], [0, .7, .65], 'body', true);
      for (const x of [-.23, .23]) p.cylinder(.11, .6, [x, 1.23, .31], 'insulator');
      for (const x of [-.28, .28]) for (const z of [-.18, .48]) { const wheel = p.cylinder(.07, .06, [x, .24, z], 'dark'); wheel.rotation.z = Math.PI / 2; }
    });
  },
  'outdoor-switchyard-substation': p => {
    p.box([6.1, .1, 4.1], [0, .07, 0], 'frame');
    // The p55 plan shows two parallel transformer bays and a separate RU building.
    for (const z of [-1.14, 1.14]) {
      p.frame(1.77, .92, .64, [-1.85, .16, z]);
      p.box([1.91, .1, .81], [-1.85, 1.11, z], 'frame');
      for (const x of [-2.5, -1.83, -1.17]) p.insulator(x, 1.17, z, .69);
      p.tank([.06, .27, z], .84, .76, .68, 3, true);
      p.box([1.16, .16, .94], [.06, .18, z], 'body');
      p.cylinder(.055, 2.32, [-.64, 1.25, z], 'frame');
      p.box([.69, .08, .42], [1.3, 1.05, z], 'frame');
      p.box([.15, .84, .22], [1.3, .64, z], 'frame');
    }
    p.shell(.91, 1.05, 3.45, [2.34, .14, 0]);
    p.gable(1.01, 3.56, 1.4, 2.34);
    p.door(2.34, .85, 1.76, .61, .89);
  },
  'battery-control-rack': p => {
    p.shell(.93, 2.15, .79, [-.49, 0, 0]);
    p.door(-.49, 1.62, .43, .79, .84, true);
    p.door(-.49, .67, .43, .79, .86, true);
    p.box([.79, .15, .045], [-.49, 1.13, .455], 'frame');
    p.frame(.84, 2.15, .79, [.47, .12, 0]);
    // p62 shows a closed front panel and the open shelving from the right side.
    p.door(.47, 1.2, .43, .77, 2.02);
    p.part('visible-battery-shelves', () => {
      for (const y of [.24, .62, 1, 1.38, 1.76, 2.16]) p.box([.81, .035, .74], [.47, y, 0], 'frame');
      // Blocks only, no inferred battery count, electrical connections or labels.
      for (const y of [.4, .78, 1.16, 1.54, 1.92]) p.box([.58, .19, .53], [.47, y, 0], 'dark');
    });
  },
  'open-distribution-panel': p => {
    p.frame(1.25, 2.13, .61, [0, .15, 0]);
    p.box([1.18, 1.97, .05], [0, 1.2, -.28], 'body');
    p.box([1.33, .21, .7], [0, .12, 0], 'frame');
    p.part('visible-open-panel-apparatus', () => {
      p.box([.34, .47, .16], [0, 1.79, .03], 'frame', true);
      for (const x of [-.12, 0, .12]) p.box([.045, .91, .075], [x, 1.08, .09], 'copper');
      for (const x of [-.44, .44]) for (const y of [.8, 1.05, 1.3]) p.box([.22, .15, .19], [x, y, .07], 'dark', true);
      p.box([1.12, .1, .2], [0, .44, .04], 'frame');
    });
  },
  'indoor-protection-enclosure': p => {
    p.shell(1.43, 1.19, .48);
    p.box([1.2, .96, .04], [0, .72, .273], 'panel', true);
    p.handle(.48, .71, .317);
    for (const x of [-.66, .66]) for (const y of [.26, 1.22]) p.box([.04, .04, .022], [x, y, .265], 'dark');
    // No canopy, feet or outdoor PTM silhouette on the separately labeled TDE view.
  },
  'round-metering-post': p => {
    p.cylinder(.18, 1.29, [0, .71, 0], 'body');
    p.box([.62, .08, .55], [0, .06, 0], 'frame');
    p.shell(.68, .79, .53, [0, 1.19, 0]);
    p.door(0, 1.7, .296, .57, .65);
    p.gable(.85, .66, 2.12);
    p.box([.22, .31, .02], [0, .47, .177], 'panel', true);
  },
  'railway-pole-single-phase': p => {
    p.cylinder(.085, 4.2, [0, 2.1, 0], 'frame');
    p.box([.84, .065, .28], [.32, 3.89, 0], 'frame');
    for (const x of [.18, .63]) p.insulator(x, 3.94, 0, .47);
    p.box([.87, .07, .6], [.32, 2.24, 0], 'frame');
    p.tank([.56, 2.28, 0], .49, .67, .48, 1);
    p.insulator(.07, 2.36, 0, .65);
    p.sideInput(.03, 3.38, 0, 1, .51);
    p.shell(.35, .57, .3, [0, .57, .14]);
    p.door(0, .96, .319, .28, .45);
    const brace = p.box([.04, .93, .04], [.3, 1.94, 0], 'frame'); brace.rotation.z = -.72;
  },
  'railway-pole-mini-transformer': p => {
    p.cylinder(.08, 4.15, [0, 2.075, 0], 'frame');
    p.box([.95, .06, .26], [-.35, 3.98, 0], 'frame');
    for (const x of [-.75, -.2]) p.insulator(x, 4.03, 0, .38);
    const brace = p.box([.04, .77, .04], [-.31, 3.68, 0], 'frame'); brace.rotation.z = -.9;
    p.tank([-.5, 1.9, 0], .48, .58, .49, 1);
    p.box([.81, .06, .58], [-.27, 1.85, 0], 'frame');
    p.sideInput(-.05, 3.06, 0, -1, .52);
    p.box([.16, .66, .24], [.12, .45, 0], 'body', true);
  },
  'railway-backboard-transformer': p => {
    p.skids(1.08, .92);
    p.shell(.98, 1.79, .22, [0, .13, -.4]);
    p.door(0, 1.14, -.257, .86, 1.6);
    p.tank([0, .27, .27], .63, .61, .6, 1);
    p.box([1.15, .09, 1.23], [0, .21, 0], 'frame');
  },
  'railway-modular-building': p => {
    p.shell(4.9, 1.52, 1.56, [0, .2, 0]);
    p.box([5.02, .22, 1.69], [0, .15, 0], 'frame');
    p.gable(5.02, 1.68, 1.94);
    for (const x of [-.97, .97]) {
      p.door(x, 1.03, .815, .57, 1.35);
      p.steps(x, .34, 1.01, 2);
      p.box([.57, .29, .04], [x, 1.54, .816], 'body', true);
    }
    p.box([.055, 1.54, 1.59], [0, 1.07, 0], 'frame');
    for (const side of [-1, 1]) for (const z of [-.35, .35]) p.sideInput(side * 2.47, 1.66, z, side, .62);
  },
  'railway-sectioning-post': p => {
    p.shell(3.5, 1.68, 1.78, [0, .17, 0]);
    p.box([3.64, .13, 1.91], [0, .14, 0], 'frame');
    p.box([3.61, .08, 1.9], [0, 2.03, 0], 'frame');
    p.door(1.18, 1.13, .923, .64, 1.43);
    p.part('external-contact-group', () => {
      for (const x of [-1.42, 1.42]) p.box([.07, 1.4, .07], [x, 2.6, -.77], 'frame');
      p.box([2.93, .07, .46], [0, 3.24, -.74], 'frame');
      for (const x of [-1.13, -.57, 0, .57, 1.13]) p.insulator(x, 2.12, -.74, 1.09);
      p.grille(2.91, .69, 0, 2.61, -.49);
    });
  },
  'railway-side-input-switchgear': p => {
    p.shell(1.08, 2.71, 1.52);
    p.door(0, 2.28, .792, .97, .88, true);
    p.door(0, .97, .792, .97, 1.48);
    p.box([.4, .41, .035], [0, 1.22, .829], 'glass');
    p.insulator(0, 2.88, 0, .6);
    for (const y of [.54, .87]) p.sideInput(.56, y, .05, 1, .63);
  },
  'mine-switchgear-window': p => {
    p.shell(.97, 2.2, 1.58);
    p.skids(1.15, 1.5);
    p.door(0, 1.78, .822, .84, .92);
    p.door(0, .68, .822, .84, 1.12);
    p.part('rounded-inspection-window', () => {
      p.box([.18, .26, .025], [0, 1.79, .858], 'glass');
      for (const x of [-.09, .09]) {
        const end = p.cylinder(.13, .025, [x, 1.79, .858], 'glass');
        end.rotation.x = Math.PI / 2;
      }
    });
  },
  'mine-fenced-switchgear': p => {
    p.skids(1.6, 1.32);
    p.shell(.86, 1.56, 1.06, [0, .13, 0]);
    p.door(0, .73, .564, .74, .87);
    p.door(0, 1.45, .564, .74, .47);
    p.frame(.9, 1.26, 1.1, [0, 1.86, 0]);
    for (const z of [-.55, .55]) p.grille(.88, 1.24, 0, 2.49, z);
    for (const x of [-.28, 0, .28]) p.insulator(x, 3.17, 0, .56);
  },
  'mine-fenced-double-switchgear': p => {
    p.shell(1.76, 1.66, 1.42);
    for (const x of [-.42, .42]) p.door(x, .95, .744, .79, 1.48);
    p.frame(1.75, 1.21, 1.43, [0, 1.88, 0]);
    for (const z of [-.715, .715]) p.grille(1.73, 1.18, 0, 2.48, z);
    p.box([1.91, .31, 1.57], [0, 3.21, 0], 'body', true);
    for (const x of [-.52, 0, .52]) p.insulator(x, 1.89, 0, .59);
  },
  'mine-low-skid-substation': p => {
    p.skids(3.45, 1.15);
    p.tank([0, .24, 0], 1.76, 1.13, 1.17, 0, true);
    for (const x of [-1.22, 1.22]) {
      p.shell(.62, .95, 1.06, [x, .13, 0]);
      p.box([.64, .08, 1.1], [x, 1.24, 0], 'frame');
      p.sideInput(x + Math.sign(x) * .33, .86, .22, Math.sign(x), .4);
    }
    p.box([.6, .38, .035], [0, .87, .65], 'panel', true);
    p.box([2.04, .08, 1.27], [0, 1.46, 0], 'frame');
  },
  'wall-canopy-control': p => {
    p.shell(1.2, 1.46, .58);
    p.door(0, .83, .324, 1.05, 1.22);
    p.box([.7, .87, .045], [0, .8, .368], 'body', true);
    p.warning(0, .98, .397, .13);
    p.box([.3, .1, .022], [0, .72, .397], 'dark');
    for (const x of [-.37, -.12, .12, .37]) {
      const indicator = p.cylinder(.035, .027, [x, 1.5, .337], 'dark'); indicator.rotation.x = Math.PI / 2;
    }
    p.box([1.33, .1, .74], [0, 1.69, .02], 'frame');
    for (const x of [-.54, .54]) p.box([.09, 1.64, .055], [x, .84, -.34], 'frame');
  },
  'long-service-container': p => {
    p.shell(5.3, 1.74, 1.84, [0, .53, 0]);
    p.box([5.48, .1, 2.02], [0, 2.42, 0], 'frame');
    p.part('corrugated-exterior', () => {
      for (const z of [-.938, .938]) for (let i = 0; i < 27; i++) p.box([.035, 1.68, .055], [-2.58 + i * .199, 1.54, z], 'frame');
    });
    for (const side of [-1, 1]) {
      p.place([side * 2.675, 0, 0], () => p.door(0, 1.44, 0, .66, 1.4), 1, side * Math.PI / 2);
      p.box([.74, .08, 1.6], [side * 3.06, .68, 0], 'frame');
      p.steps(side * 3.08, .65, .61, 5);
      p.box([.65, .045, .045], [side * 3.06, 1.23, -.78], 'frame');
      for (const dx of [-.31, .31]) p.box([.04, .56, .04], [side * 3.06 + dx, .95, -.78], 'frame');
      p.box([.12, .53, .14], [side * 2.29, 2.68, -.55], 'frame');
      p.box([.2, .045, .21], [side * 2.29, 2.97, -.55], 'body');
      for (const z of [-.79, .79]) p.box([.1, .53, .1], [side * 2.43, .3, z], 'frame');
    }
  },
};

export const sourceGeometryTypes = Object.freeze(Object.keys(constructions));
export function buildSourceEquipmentGeometry(type, api) {
  if (!Object.hasOwn(constructions, type)) return false;
  constructions[type](primitives(api));
  return true;
}
