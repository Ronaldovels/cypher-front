// Cypher Onboarding — 3D Mannequin v3 (organic, PBR, premium)

function Mannequin3D({ picks, complete }) {
  const ref = React.useRef(null);
  const stateRef = React.useRef({});

  React.useEffect(() => {
    const mount = ref.current;
    if (!mount || !window.THREE) return;
    const THREE = window.THREE;

    const w = mount.clientWidth || 480;
    const h = mount.clientHeight || 440;

    // ===== Scene & camera =====
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, w / h, 0.1, 100);
    camera.position.set(0, 1.6, 9);
    camera.lookAt(0, 1.1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // ===== Studio lights =====
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xfff4e8, 0.9);
    key.position.set(3, 6.5, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -2.5;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d6ff, 0.35);
    fill.position.set(-3, 2.5, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff8a4d, 0.22);
    rim.position.set(-2, 4, -4);
    scene.add(rim);

    // ===== Materials (PBR) =====
    const M = THREE.MeshPhysicalMaterial ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const physical = (opts) => new M({ ...opts });

    const bodyMat = physical({
      color: 0xDDD6C8, roughness: 0.85, metalness: 0.0,
      clearcoat: 0.04, clearcoatRoughness: 0.6,
      sheen: 0.25, sheenColor: new THREE.Color(0xF3EBDC), sheenRoughness: 0.9,
    });
    const ghostMat = physical({
      color: 0xDDD6C8, roughness: 0.95, metalness: 0.0,
      transparent: true, opacity: 0.07,
    });

    // ===== Mannequin (organic LatheGeometry) =====
    const character = new THREE.Group();
    scene.add(character);

    const addMesh = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true;
      m.receiveShadow = true;
      (parent || character).add(m);
      return m;
    };

    // --- Torso lathe (continuous: hips → waist → chest → shoulders) ---
    const torsoProfile = [
      new THREE.Vector2(0.001, -0.05),
      new THREE.Vector2(0.40, -0.04),
      new THREE.Vector2(0.46, 0.18),
      new THREE.Vector2(0.42, 0.45),  // waist
      new THREE.Vector2(0.48, 0.75),
      new THREE.Vector2(0.55, 1.00),  // upper chest
      new THREE.Vector2(0.52, 1.20),
      new THREE.Vector2(0.42, 1.30),
      new THREE.Vector2(0.22, 1.34),  // shoulder cap
      new THREE.Vector2(0.001, 1.36),
    ];
    const torsoGeo = new THREE.LatheGeometry(torsoProfile, 48);
    const torso = addMesh(torsoGeo, bodyMat, 0, 0.55, 0);
    torso.scale.z = 0.78; // slight front-back compression

    // --- Hips/pelvis fill (smaller lathe at base) ---
    const pelvisProfile = [
      new THREE.Vector2(0.001, -0.2),
      new THREE.Vector2(0.32, -0.18),
      new THREE.Vector2(0.44, 0.0),
      new THREE.Vector2(0.42, 0.12),
      new THREE.Vector2(0.001, 0.16),
    ];
    const pelvis = addMesh(new THREE.LatheGeometry(pelvisProfile, 48), bodyMat, 0, 0.5, 0);
    pelvis.scale.z = 0.82;

    // --- Neck (continuous from torso top) ---
    const neckProfile = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.17, 0.0),
      new THREE.Vector2(0.16, 0.18),
      new THREE.Vector2(0.18, 0.28),
      new THREE.Vector2(0.001, 0.3),
    ];
    addMesh(new THREE.LatheGeometry(neckProfile, 32), bodyMat, 0, 1.92, 0);

    // --- Head (smooth oval, subtle chin via scale) ---
    const headGeo = new THREE.SphereGeometry(0.45, 64, 48);
    const head = addMesh(headGeo, bodyMat, 0, 2.55, 0);
    head.scale.set(0.96, 1.04, 0.96);
    // Subtle chin: blend a small lathe under sphere
    const chinProfile = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.32, 0.0),
      new THREE.Vector2(0.28, 0.08),
      new THREE.Vector2(0.001, 0.1),
    ];
    addMesh(new THREE.LatheGeometry(chinProfile, 32), bodyMat, 0, 2.18, 0.02);

    // --- Arms (single lathe per limb: shoulder → elbow → wrist) ---
    const armProfile = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.14, 0.02),
      new THREE.Vector2(0.16, 0.18),  // bicep
      new THREE.Vector2(0.13, 0.55),  // elbow inward
      new THREE.Vector2(0.135, 0.65), // forearm
      new THREE.Vector2(0.12, 1.10),  // wrist
      new THREE.Vector2(0.001, 1.12),
    ];
    const armGeo = new THREE.LatheGeometry(armProfile, 32);
    const armL = addMesh(armGeo, bodyMat, -0.62, 0.5, 0);
    armL.rotation.x = Math.PI; // hang down (root at top)
    armL.position.y = 1.85;
    const armR = addMesh(armGeo, bodyMat, 0.62, 1.85, 0);
    armR.rotation.x = Math.PI;

    // --- Hands (mitten with thumb hint) ---
    const handGeo = new THREE.SphereGeometry(0.16, 32, 24);
    const handL = addMesh(handGeo, bodyMat, -0.62, 0.62, 0);
    handL.scale.set(0.82, 1.2, 0.55);
    const handR = addMesh(handGeo, bodyMat, 0.62, 0.62, 0);
    handR.scale.set(0.82, 1.2, 0.55);
    // Thumb stubs
    const thumbGeo = new THREE.SphereGeometry(0.07, 24, 18);
    const thumbL = addMesh(thumbGeo, bodyMat, -0.5, 0.66, 0.04);
    thumbL.scale.set(0.95, 1.25, 0.9);
    const thumbR = addMesh(thumbGeo, bodyMat, 0.5, 0.66, 0.04);
    thumbR.scale.set(0.95, 1.25, 0.9);

    // --- Legs (lathe: hip → knee → ankle) ---
    const legProfile = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.18, 0.02),
      new THREE.Vector2(0.21, 0.15),  // thigh top
      new THREE.Vector2(0.19, 0.6),   // mid thigh
      new THREE.Vector2(0.16, 0.85),  // knee
      new THREE.Vector2(0.17, 0.95),  // calf top
      new THREE.Vector2(0.15, 1.35),  // calf
      new THREE.Vector2(0.12, 1.55),  // ankle
      new THREE.Vector2(0.001, 1.58),
    ];
    const legGeo = new THREE.LatheGeometry(legProfile, 32);
    const legL = addMesh(legGeo, bodyMat, -0.22, 0.5, 0);
    legL.rotation.x = Math.PI;
    legL.position.y = 0.55;
    const legR = addMesh(legGeo, bodyMat, 0.22, 0.55, 0);
    legR.rotation.x = Math.PI;

    // --- Feet (flat ovoid) ---
    const footGeo = new THREE.SphereGeometry(0.18, 32, 20);
    const footL = addMesh(footGeo, bodyMat, -0.22, -0.92, 0.08);
    footL.scale.set(0.95, 0.55, 1.45);
    const footR = addMesh(footGeo, bodyMat, 0.22, -0.92, 0.08);
    footR.scale.set(0.95, 0.55, 1.45);

    // ===== Ground (soft contact) =====
    const groundMat = physical({ color: 0xEDE6D8, roughness: 1.0, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // Contact disc shadow gradient (a softened second disc with alpha map would be ideal; use radial mat)
    const contactMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 });
    const contact = new THREE.Mesh(new THREE.CircleGeometry(0.85, 64), contactMat);
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -1.015;
    scene.add(contact);

    // ===================== EPIs =====================
    const epis = {};

    // Animatable wrapper — accepts a builder fn and tracks meshes for opacity
    const makeAnimGroup = (builder) => {
      const g = new THREE.Group();
      builder(g);
      g.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0;
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      g.visible = false;
      g.scale.setScalar(0.92);
      return g;
    };

    // ---------- HELMET ----------
    const helmetMatBase = physical({ color: 0xF5C518, roughness: 0.32, metalness: 0.05, clearcoat: 0.45, clearcoatRoughness: 0.25 });
    const helmetDarkBase = physical({ color: 0x8a6500, roughness: 0.55 });
    const helmet = makeAnimGroup((g) => {
      // Dome: half sphere
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2),
        helmetMatBase
      );
      dome.position.set(0, 2.62, 0);
      dome.scale.set(1.03, 0.95, 1.07);
      g.add(dome);
      // Crown channel — subtle torus pressed into top
      const channel = new THREE.Mesh(
        new THREE.TorusGeometry(0.43, 0.018, 12, 36, Math.PI),
        helmetDarkBase
      );
      channel.position.set(0, 3.04, 0);
      channel.rotation.x = Math.PI / 2;
      channel.rotation.z = Math.PI;
      channel.scale.z = 0.6;
      g.add(channel);
      // Brim — flatter ring extending front
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.54, 0.55, 0.05, 48, 1, false),
        helmetMatBase
      );
      brim.position.set(0, 2.6, 0.06);
      brim.scale.set(1, 1, 1.5);
      g.add(brim);
      // Chinstrap (only for cap-j)
      const chinStrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.43, 0.018, 8, 32, Math.PI),
        helmetDarkBase
      );
      chinStrap.position.set(0, 2.3, 0.06);
      chinStrap.rotation.x = -Math.PI / 2;
      chinStrap.rotation.z = Math.PI;
      g.add(chinStrap);
      g.userData.chinStrap = chinStrap;
    });
    epis.capacete = helmet;

    // ---------- GOGGLES ----------
    const goggleFrameBase = physical({ color: 0x1a1a1a, roughness: 0.42, metalness: 0.1 });
    const goggleLensBase = physical({
      color: 0x2A6FDB, roughness: 0.06, metalness: 0.0,
      transmission: 0.55, ior: 1.45, thickness: 0.05,
      transparent: true, opacity: 0.85,
    });
    const goggles = makeAnimGroup((g) => {
      // Wide curved lens via partial sphere
      const lens = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 48, 32, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.43, Math.PI * 0.16),
        goggleLensBase
      );
      lens.position.set(0, 2.52, 0);
      lens.scale.set(1, 1, 1.04);
      g.add(lens);
      // Frame trim — slightly larger partial sphere
      const frame = new THREE.Mesh(
        new THREE.SphereGeometry(0.515, 48, 32, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.42, Math.PI * 0.18),
        goggleFrameBase
      );
      frame.position.set(0, 2.52, 0);
      frame.scale.set(1, 1, 1.04);
      g.add(frame);
      // Strap
      const strap = new THREE.Mesh(
        new THREE.TorusGeometry(0.47, 0.028, 12, 40),
        goggleFrameBase
      );
      strap.position.set(0, 2.55, 0);
      strap.rotation.y = Math.PI / 2;
      strap.scale.set(1, 0.62, 1);
      g.add(strap);
    });
    epis.oculos = goggles;

    // ---------- EARMUFFS ----------
    const emCupBase = physical({ color: 0xFF6A2F, roughness: 0.48, clearcoat: 0.2 });
    const emCushBase = physical({ color: 0x222222, roughness: 0.78 });
    const earmuffs = makeAnimGroup((g) => {
      for (const sx of [-1, 1]) {
        // Cup — lathe profile (rounded disc)
        const cupProf = [
          new THREE.Vector2(0.001, 0),
          new THREE.Vector2(0.16, 0.01),
          new THREE.Vector2(0.17, 0.07),
          new THREE.Vector2(0.16, 0.10),
          new THREE.Vector2(0.001, 0.11),
        ];
        const cup = new THREE.Mesh(new THREE.LatheGeometry(cupProf, 32), emCupBase);
        cup.position.set(sx * 0.49, 2.5, 0);
        cup.rotation.z = sx * Math.PI / 2;
        g.add(cup);
        // Cushion ring
        const cush = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.038, 16, 36), emCushBase);
        cush.position.set(sx * 0.54, 2.5, 0);
        cush.rotation.y = Math.PI / 2;
        g.add(cush);
      }
      // Headband (arc)
      const bandGeo = new THREE.TorusGeometry(0.44, 0.038, 14, 36, Math.PI);
      const band = new THREE.Mesh(bandGeo, emCushBase);
      band.position.set(0, 2.78, 0);
      band.rotation.y = Math.PI / 2;
      band.rotation.x = Math.PI;
      g.add(band);
      // Band soft pad
      const padGeo = new THREE.TorusGeometry(0.42, 0.028, 14, 28, Math.PI * 0.65);
      const pad = new THREE.Mesh(padGeo, emCupBase);
      pad.position.set(0, 2.81, 0);
      pad.rotation.y = Math.PI / 2;
      pad.rotation.x = Math.PI;
      g.add(pad);
    });
    epis.auricular = earmuffs;

    // ---------- MASK ----------
    const maskShellBase = physical({ color: 0xf4f2ec, roughness: 0.5, clearcoat: 0.15 });
    const maskRubberBase = physical({ color: 0x6e6963, roughness: 0.78 });
    const maskFilterBase = physical({ color: 0x9a958a, roughness: 0.7 });
    const mask = makeAnimGroup((g) => {
      // Shell (rounded half-globe hugging lower face)
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 40, 28, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
        maskShellBase
      );
      shell.position.set(0, 2.6, 0.06);
      shell.scale.set(1.05, 1, 1.06);
      g.add(shell);
      // Soft seal (darker rubber rim around shell opening)
      const seal = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.025, 14, 40),
        maskRubberBase
      );
      seal.position.set(0, 2.42, 0.0);
      seal.rotation.x = Math.PI / 2;
      seal.scale.set(1.05, 1.06, 0.65);
      g.add(seal);
      // Filter cartridges (lathe — disc with rounded edge)
      const filterProf = [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(0.075, 0.01),
        new THREE.Vector2(0.075, 0.06),
        new THREE.Vector2(0.065, 0.075),
        new THREE.Vector2(0.001, 0.078),
      ];
      const filterGeo = new THREE.LatheGeometry(filterProf, 28);
      const filtL = new THREE.Mesh(filterGeo, maskFilterBase);
      filtL.position.set(-0.27, 2.45, 0.22);
      filtL.rotation.z = Math.PI / 2;
      filtL.rotation.y = -Math.PI / 10;
      g.add(filtL);
      const filtR = filtL.clone();
      filtR.position.x = 0.27;
      filtR.rotation.y = Math.PI / 10;
      g.add(filtR);
      // Exhale valve
      const exhale = new THREE.Mesh(new THREE.LatheGeometry(filterProf, 28), maskFilterBase);
      exhale.position.set(0, 2.42, 0.32);
      exhale.rotation.x = -Math.PI / 2;
      exhale.scale.set(0.7, 0.6, 0.7);
      g.add(exhale);
      // Strap
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.018, 8, 32), maskRubberBase);
      strap.position.set(0, 2.55, 0);
      strap.rotation.y = Math.PI / 2;
      strap.scale.set(1, 0.72, 1);
      g.add(strap);
    });
    epis.mascara = mask;

    // ---------- VEST (continuous lathe wrapping torso) ----------
    const vestFabricBase = physical({
      color: 0xF26F1C, roughness: 0.82, metalness: 0,
      sheen: 0.4, sheenColor: new THREE.Color(0xFFA060), sheenRoughness: 0.85,
    });
    const stripeBase = physical({
      color: 0xEEEEEE, roughness: 0.22, metalness: 0.15,
      emissive: 0x666666, emissiveIntensity: 0.28,
      clearcoat: 0.3, clearcoatRoughness: 0.2,
    });
    const vestSeamBase = physical({ color: 0xA0440B, roughness: 0.75 });
    const vest = makeAnimGroup((g) => {
      // Outer lathe profile: slightly larger than torso
      const vestProf = [
        new THREE.Vector2(0.001, 0.45),  // bottom hem
        new THREE.Vector2(0.49, 0.45),
        new THREE.Vector2(0.47, 0.5),
        new THREE.Vector2(0.52, 0.78),
        new THREE.Vector2(0.58, 1.02),  // chest
        new THREE.Vector2(0.55, 1.22),
        new THREE.Vector2(0.45, 1.30),
        new THREE.Vector2(0.001, 1.32),
      ];
      const vestGeo = new THREE.LatheGeometry(vestProf, 48, 0, Math.PI * 2);
      const vestMesh = new THREE.Mesh(vestGeo, vestFabricBase);
      vestMesh.position.set(0, 0.55, 0);
      vestMesh.scale.z = 0.8;
      g.add(vestMesh);
      // Front seam (vertical strip down center)
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 1.4, 0.025),
        vestSeamBase
      );
      seam.position.set(0, 1.25, 0.45);
      g.add(seam);
      // Reflective stripes (horizontal bands as flattened tori)
      for (const y of [1.18, 1.65]) {
        const stripeGeo = new THREE.TorusGeometry(0.52, 0.035, 14, 48);
        const stripe = new THREE.Mesh(stripeGeo, stripeBase);
        stripe.position.set(0, y, 0);
        stripe.rotation.x = Math.PI / 2;
        stripe.scale.set(1, 0.8, 1);
        g.add(stripe);
      }
      // Diagonal chest stripes (suspender effect)
      for (const sx of [-1, 1]) {
        const diag = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.5, 0.018),
          stripeBase
        );
        diag.position.set(sx * 0.17, 1.65, 0.46);
        diag.rotation.z = sx * Math.PI / 18;
        g.add(diag);
      }
    });
    epis.colete = vest;

    // ---------- GLOVES ----------
    const gloveLeatherBase = physical({ color: 0x6B4A2E, roughness: 0.78 });
    const gloveCuffBase = physical({ color: 0x4A301A, roughness: 0.82 });
    const gloves = makeAnimGroup((g) => {
      for (const sx of [-1, 1]) {
        const glove = new THREE.Group();
        // Palm — mitten ovoid
        const palm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 36, 24), gloveLeatherBase);
        palm.scale.set(0.88, 1.15, 0.62);
        glove.add(palm);
        // Thumb
        const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 18), gloveLeatherBase);
        thumb.position.set(sx * 0.14, 0.05, 0.06);
        thumb.scale.set(0.95, 1.35, 0.9);
        glove.add(thumb);
        // Cuff (lathe — flared)
        const cuffProf = [
          new THREE.Vector2(0.001, 0),
          new THREE.Vector2(0.155, 0.01),
          new THREE.Vector2(0.17, 0.12),
          new THREE.Vector2(0.18, 0.24),
          new THREE.Vector2(0.001, 0.26),
        ];
        const cuff = new THREE.Mesh(new THREE.LatheGeometry(cuffProf, 28), gloveCuffBase);
        cuff.position.set(0, 0.15, 0);
        glove.add(cuff);
        glove.position.set(sx * 0.62, 0.62, 0);
        g.add(glove);
      }
    });
    epis.luvas = gloves;

    // ---------- BOOTS ----------
    const bootLeatherBase = physical({ color: 0x141414, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45 });
    const bootSoleBase = physical({ color: 0x0a0a0a, roughness: 0.92 });
    const bootAccentBase = physical({ color: 0xF4622A, roughness: 0.35, clearcoat: 0.35 });
    const boots = makeAnimGroup((g) => {
      for (const sx of [-1, 1]) {
        const boot = new THREE.Group();
        // Shaft (lathe — ankle support)
        const shaftProf = [
          new THREE.Vector2(0.001, 0),
          new THREE.Vector2(0.18, 0.01),
          new THREE.Vector2(0.19, 0.2),
          new THREE.Vector2(0.2, 0.35),
          new THREE.Vector2(0.001, 0.36),
        ];
        const shaft = new THREE.Mesh(new THREE.LatheGeometry(shaftProf, 32), bootLeatherBase);
        shaft.position.set(0, -0.78, 0);
        boot.add(shaft);
        // Foot body — elongated ovoid
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 40, 24), bootLeatherBase);
        foot.position.set(0, -0.9, 0.08);
        foot.scale.set(0.95, 0.68, 1.55);
        boot.add(foot);
        // Sole — flat under-disc
        const soleGeo = new THREE.CylinderGeometry(0.22, 0.21, 0.05, 32);
        const sole = new THREE.Mesh(soleGeo, bootSoleBase);
        sole.position.set(0, -1.02, 0.04);
        sole.scale.set(1, 1, 1.6);
        boot.add(sole);
        // Lace area (subtle darker band on top)
        const lace = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          bootSoleBase
        );
        lace.position.set(0, -0.85, 0.18);
        lace.scale.set(0.7, 0.7, 1.2);
        boot.add(lace);
        // Electric accent (toggled)
        const accent = new THREE.Mesh(
          new THREE.TorusGeometry(0.19, 0.018, 10, 32),
          bootAccentBase
        );
        accent.position.set(0, -0.95, 0.06);
        accent.rotation.x = Math.PI / 2;
        accent.scale.set(1, 0.6, 1.5);
        accent.visible = false;
        boot.add(accent);
        boot.userData.accent = accent;
        boot.position.set(sx * 0.22, 0, 0);
        g.add(boot);
      }
    });
    epis.botas = boots;

    // ---------- HARNESS ----------
    const harnessBase = physical({ color: 0x1F4D8A, roughness: 0.62, sheen: 0.2 });
    const harnessMetalBase = physical({ color: 0xb0b0b0, roughness: 0.28, metalness: 0.85 });
    const harness = makeAnimGroup((g) => {
      // Waist belt (toroidal ring)
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 14, 48), harnessBase);
      belt.position.set(0, 0.85, 0);
      belt.rotation.x = Math.PI / 2;
      belt.scale.z = 0.82;
      g.add(belt);
      // Shoulder Y-straps (front)
      for (const sx of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.022), harnessBase);
        strap.position.set(sx * 0.2, 1.5, 0.42);
        strap.rotation.z = sx * Math.PI / 24;
        g.add(strap);
        // Back
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.022), harnessBase);
        back.position.set(sx * 0.2, 1.85, -0.36);
        g.add(back);
      }
      // Chest cross
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.024), harnessBase);
      cross.position.set(0, 1.55, 0.44);
      g.add(cross);
      // Leg loops
      for (const sx of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 10, 32), harnessBase);
        loop.position.set(sx * 0.24, 0.45, 0);
        loop.rotation.x = Math.PI / 2;
        loop.scale.set(1, 0.55, 1);
        g.add(loop);
      }
      // D-ring (metal)
      const dRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 12, 24), harnessMetalBase);
      dRing.position.set(0, 1.55, 0.5);
      g.add(dRing);
    });
    epis.cinto = harness;

    // ===== Ghost outlines (subtle silhouette where slot is empty) =====
    const ghosts = {};
    const makeGhost = (sourceGroup) => {
      // Clone meshes with ghost material
      const ghost = new THREE.Group();
      sourceGroup.children.forEach((m) => {
        if (m.isMesh) {
          const gm = new THREE.Mesh(m.geometry, ghostMat);
          gm.position.copy(m.position);
          gm.rotation.copy(m.rotation);
          gm.scale.copy(m.scale);
          ghost.add(gm);
        } else if (m.isGroup) {
          const sub = new THREE.Group();
          sub.position.copy(m.position);
          sub.rotation.copy(m.rotation);
          sub.scale.copy(m.scale);
          m.children.forEach((c) => {
            if (c.isMesh) {
              const gm = new THREE.Mesh(c.geometry, ghostMat);
              gm.position.copy(c.position);
              gm.rotation.copy(c.rotation);
              gm.scale.copy(c.scale);
              sub.add(gm);
            }
          });
          ghost.add(sub);
        }
      });
      ghost.scale.copy(sourceGroup.scale);
      ghost.visible = false;
      return ghost;
    };

    // Build ghosts AFTER EPIs (using their geometry)
    Object.keys(epis).forEach((k) => {
      const g = makeGhost(epis[k]);
      ghosts[k] = g;
      character.add(g);
    });

    // Add EPIs after ghosts so they render on top
    Object.values(epis).forEach((g) => character.add(g));

    // ===== State =====
    const state = stateRef.current;
    Object.assign(state, {
      scene, camera, renderer, character, epis, ghosts,
      mats: { helmetMatBase, vestFabricBase, gloveLeatherBase, bootLeatherBase, goggleLensBase },
      targetOpacity: {},
      currentOpacity: {},
    });

    state.applyPicks = (picks) => {
      const epiToCat = {
        capacete:'cabeca', oculos:'olhos', auricular:'audicao',
        mascara:'respiracao', colete:'corpo', luvas:'maos',
        botas:'pes', cinto:'altura',
      };
      for (const k of Object.keys(epis)) {
        const cat = epiToCat[k];
        const present = !!picks[cat];
        state.targetOpacity[k] = present ? 1 : 0;
        if (state.currentOpacity[k] === undefined) state.currentOpacity[k] = 0;
        // Toggle ghost — only show when no pick
        if (ghosts[k]) ghosts[k].visible = !present;
      }
      // Material variations — propagate to cloned mats inside groups
      const setGroupColor = (group, hex) => {
        group.traverse((o) => {
          if (o.isMesh && o.material && o.material.userData.__roleColor) {
            o.material.color.setHex(hex);
          }
        });
      };
      // Helmet
      const helmetColor =
        picks.cabeca === 'cap-b' ? 0xE84A2F :
        picks.cabeca === 'cap-j' ? 0x1A6FE0 : 0xF5C518;
      helmet.children.forEach((c, i) => {
        if (c.isMesh && c.material && c !== helmet.userData.chinStrap) {
          if (c.material.roughness < 0.5) c.material.color.setHex(helmetColor);
        }
      });
      if (helmet.userData.chinStrap) {
        helmet.userData.chinStrap.visible = picks.cabeca === 'cap-j';
      }
      // Goggles lens tint
      goggles.traverse((o) => {
        if (o.isMesh && o.material && o.material.transmission !== undefined && o.material.transmission > 0) {
          if (picks.olhos === 'oc-s') o.material.color.setHex(0x0a0a0a);
          else if (picks.olhos === 'oc-fs') o.material.color.setHex(0xa8c5d8);
          else o.material.color.setHex(0x2A6FDB);
        }
      });
      // Vest fabric
      const vestColor = picks.corpo === 'co-av' ? 0x6B4A2E : 0xF26F1C;
      vest.traverse((o) => {
        if (o.isMesh && o.material && o.material.sheen !== undefined && o.material.sheen > 0.3) {
          o.material.color.setHex(vestColor);
        }
      });
      // Gloves
      const gloveColor =
        picks.maos === 'lv-ni' ? 0x1f5e2a :
        picks.maos === 'lv-ar' ? 0x1a4a8c : 0x6B4A2E;
      gloves.traverse((o) => {
        if (o.isMesh && o.material) {
          // Distinguish palm (lighter) from cuff (darker) by initial roughness
          if (o.material.roughness < 0.8) o.material.color.setHex(gloveColor);
        }
      });
      // Boot accent
      const electric = picks.pes === 'bo-id';
      boots.traverse((o) => {
        if (o.isMesh && o.userData) {}
      });
      boots.children.forEach((b) => {
        if (b.userData && b.userData.accent) b.userData.accent.visible = electric;
      });
    };
    state.applyPicks(picks || {});

    // Resize
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    // Animation loop — ease-out, no bounce
    let rafId;
    const clock = new THREE.Clock();
    // ease-out (cubic-bezier .2,.8,.2,1 approx): we'll use exponential approach with adjusted rate
    const EASE = 7.5; // higher = snappier
    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      character.rotation.y += dt * 0.28;
      character.position.y = Math.sin(t * 1.1) * 0.032;
      for (const k in epis) {
        const target = state.targetOpacity[k] ?? 0;
        const cur = state.currentOpacity[k] ?? 0;
        const next = cur + (target - cur) * Math.min(1, dt * EASE);
        state.currentOpacity[k] = next;
        const group = epis[k];
        group.visible = next > 0.01;
        group.scale.setScalar(0.92 + 0.08 * next);
        group.traverse((o) => {
          if (o.isMesh && o.material) {
            const baseOpacity = (o.material.userData.__baseOpacity ?? 1);
            o.material.opacity = baseOpacity * next;
          }
        });
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    // Tag base opacity for transparent materials (lens) so we don't overshoot
    Object.values(epis).forEach((g) => {
      g.traverse((o) => {
        if (o.isMesh && o.material && o.material.transparent) {
          o.material.userData.__baseOpacity = o.material.opacity === 0 ? 1 : o.material.opacity;
        }
      });
    });
    animate();

    state.cleanup = () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
      try { mount.removeChild(renderer.domElement); } catch (e) {}
    };
    return state.cleanup;
  }, []);

  React.useEffect(() => {
    const state = stateRef.current;
    if (state.applyPicks) state.applyPicks(picks || {});
  }, [picks]);

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}

Object.assign(window, { Mannequin3D });
