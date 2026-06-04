#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Renderiza cada slide como PNG de alta resolucion en paleta Cloud Light (SF Pro)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = "/tmp/zuyu_slides"
os.makedirs(OUT, exist_ok=True)

# --- Paleta Cloud Light (de la investigacion, WCAG AA) ---
BG       = "#FAFAFA"
CARD     = "#F1F5F9"
BORDER   = "#E2E8F0"
TITLE    = "#0F172A"
BODY     = "#334155"
SUB      = "#64748B"
INDIGO   = "#4F46E5"
CYAN     = "#0891B2"
# capas del diagrama
C_EDGE   = "#6B7280"   # gris  - cliente
C_APP    = "#4F46E5"   # indigo - ingress/api
C_DATA   = "#16A34A"   # verde - mongo/redis
C_WORK   = "#7C3AED"   # morado - worker
C_EXT    = "#D97706"   # ambar - carrier externo
WHITE    = "#FFFFFF"

SCALE = 2
LW, LH = 1280, 720          # canvas logico
W, H = LW * SCALE, LH * SCALE

SFNS = "/System/Library/Fonts/SFNS.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"

def F(size, weight="Regular", mono=False):
    f = ImageFont.truetype(MONO if mono else SFNS, int(size * SCALE))
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f

def s(v):
    return int(v * SCALE)

def new_slide(bg=BG):
    img = Image.new("RGB", (W, H), bg)
    return img, ImageDraw.Draw(img)

def footer(d, page):
    d.text((s(64), s(682)), "ZUYU · Micrositio de Pedidos", font=F(14, "Medium"), fill=SUB, anchor="lm")
    d.text((s(1216), s(682)), f"{page:02d}", font=F(14, "Semibold"), fill=SUB, anchor="rm")

def head(d, title, kicker=None):
    # barra de acento + titulo + regla indigo
    x = 64
    d.rounded_rectangle([s(x), s(58), s(x+34), s(70)], radius=s(3), fill=INDIGO)
    if kicker:
        d.text((s(x), s(96)), kicker.upper(), font=F(15, "Bold"), fill=CYAN, anchor="lm")
        ty = 130
    else:
        ty = 110
    d.text((s(x), s(ty)), title, font=F(44, "Bold"), fill=TITLE, anchor="lm")
    d.line([s(x), s(ty+42), s(x+70), s(ty+42)], fill=INDIGO, width=s(4))
    return ty

def bullets(d, items, y0=240, x=64, gap=92):
    # items: (label, text) o (None, text)
    y = y0
    for label, text in items:
        d.ellipse([s(x), s(y-7), s(x+14), s(y+7)], fill=INDIGO)
        bx = x + 34
        if label:
            d.text((s(bx), s(y)), label, font=F(25, "Bold"), fill=INDIGO, anchor="lm")
            lw = d.textlength(label + " ", font=F(25, "Bold"))
            d.text((s(bx) + lw, s(y)), text, font=F(25, "Regular"), fill=BODY, anchor="lm")
        else:
            d.text((s(bx), s(y)), text, font=F(25, "Regular"), fill=BODY, anchor="lm")
        y += gap

def arrow(d, x0, y0, x1, y1, color=SUB, wdt=3, head=14):
    d.line([s(x0), s(y0), s(x1), s(y1)], fill=color, width=s(wdt))
    import math
    ang = math.atan2(y1 - y0, x1 - x0)
    for da in (math.radians(150), math.radians(-150)):
        hx = x1 + head * math.cos(ang + da)
        hy = y1 + head * math.sin(ang + da)
        d.line([s(x1), s(y1), s(hx), s(hy)], fill=color, width=s(wdt))

def box(d, x, y, w, h, color, label, sub=None, fill=WHITE):
    d.rounded_rectangle([s(x), s(y), s(x+w), s(y+h)], radius=s(12), fill=fill, outline=color, width=s(3))
    cy = y + h/2 if not sub else y + h/2 - 13
    d.text((s(x+w/2), s(cy)), label, font=F(22, "Bold"), fill=color, anchor="mm")
    if sub:
        d.text((s(x+w/2), s(y+h/2+15)), sub, font=F(15, "Regular"), fill=SUB, anchor="mm")

def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, "PNG")
    return p

# ============ SLIDE 1 — PORTADA ============
img, d = new_slide()
# acento esquina superior (degradado firma simulado con 2 barras)
d.rectangle([0, 0, W, s(10)], fill=INDIGO)
d.rectangle([0, s(10), W, s(16)], fill=CYAN)
d.text((s(64), s(250)), "Micrositio de Pedidos", font=F(74, "Bold"), fill=TITLE, anchor="lm")
d.text((s(64), s(335)), "y Delivery", font=F(74, "Bold"), fill=TITLE, anchor="lm")
d.line([s(64), s(400), s(64+260), s(400)], fill=INDIGO, width=s(6))
d.text((s(64), s(445)), "Proyecto final  ·  Kubernetes / DevOps", font=F(30, "Medium"), fill=INDIGO, anchor="lm")
d.text((s(64), s(620)), "Sebastián Contreras   ·   Grupo G-02", font=F(20, "Regular"), fill=BODY, anchor="lm")
d.text((s(64), s(655)), "Capa de pedidos sobre ZUYU (SaaS de punto de venta para PyMEs)", font=F(17, "Regular"), fill=SUB, anchor="lm")
save(img, "01.png")

# ============ SLIDE 2 — PROBLEMA / SOLUCION ============
img, d = new_slide()
head(d, "El problema y la solución")
bullets(d, [
    ("Problema:", "vender en línea y coordinar entregas sin montar infraestructura."),
    ("Solución:", "una app web lista para PRODUCCIÓN, no solo “que funcione”."),
    (None, "Catálogo → pedido → repartidor → entrega."),
], y0=250)
# card resumen
d.rounded_rectangle([s(64), s(540), s(1216), s(630)], radius=s(14), fill=CARD, outline=BORDER, width=s(2))
d.text((s(90), s(585)), "Alta disponibilidad · escalado automático · seguridad de red · CI/CD · observabilidad",
       font=F(22, "Semibold"), fill=TITLE, anchor="lm")
footer(d, 2)
save(img, "02.png")

# ============ SLIDE 3 — ARQUITECTURA (DIAGRAMA) ============
img, d = new_slide()
head(d, "Arquitectura", kicker="cómo está construido")
# contenedor cluster (punteado) — envuelve Ingress, API, Worker, Mongo, Redis
d.rounded_rectangle([s(300), s(250), s(1035), s(560)], radius=s(16), outline=BORDER, width=s(2))
d.text((s(312), s(272)), "KUBERNETES", font=F(13, "Bold"), fill=SUB, anchor="lm")
# fila principal
box(d, 70, 300, 150, 80, C_EDGE, "Cliente", "navegador")
arrow(d, 228, 340, 318, 340, C_EDGE)
box(d, 320, 300, 150, 80, C_APP, "Ingress", "HTTPS / TLS")
arrow(d, 478, 340, 568, 340, C_APP)
box(d, 570, 300, 170, 80, C_APP, "API", "Node · Express")
# datos (dentro del cluster)
arrow(d, 748, 340, 838, 340, C_DATA)
box(d, 840, 295, 180, 48, C_DATA, "MongoDB ×3", fill=WHITE)
box(d, 840, 352, 180, 48, C_DATA, "Redis (cola)", fill=WHITE)
d.text((s(930), s(420)), "Replica Set", font=F(14, "Regular"), fill=SUB, anchor="mm")
# worker async (cae hacia abajo desde API)
arrow(d, 655, 382, 655, 478, C_WORK)
d.text((s(672), s(430)), "encola job", font=F(14, "Regular"), fill=SUB, anchor="lm")
box(d, 570, 480, 170, 70, C_WORK, "Worker", "BullMQ async")
# carrier EXTERNO (fuera del cluster)
arrow(d, 748, 515, 1043, 515, C_EXT)
d.text((s(895), s(497)), "API / webhook", font=F(14, "Regular"), fill=SUB, anchor="mm")
box(d, 1045, 480, 185, 70, C_EXT, "Carrier", "iVoy · Uber · Lalamove")
# leyenda
ly = 625
lx = 70
for col, lab in [(C_EDGE,"Edge"),(C_APP,"App"),(C_DATA,"Datos"),(C_WORK,"Worker async"),(C_EXT,"Externo")]:
    d.ellipse([s(lx), s(ly-8), s(lx+16), s(ly+8)], fill=col)
    d.text((s(lx+24), s(ly)), lab, font=F(17, "Medium"), fill=BODY, anchor="lm")
    lx += int(d.textlength(lab, font=F(17,"Medium"))/SCALE) + 70
footer(d, 3)
save(img, "03.png")

# ============ helper para slides de concepto con mini-visual a la derecha ============
def concepto(name, page, title, kicker, items, draw_visual):
    img, d = new_slide()
    head(d, title, kicker=kicker)
    bullets(d, items, y0=250, gap=86)
    # panel visual a la derecha
    d.rounded_rectangle([s(800), s(225), s(1216), s(560)], radius=s(16), fill=CARD, outline=BORDER, width=s(2))
    draw_visual(d)
    footer(d, page)
    save(img, name)

# 4 — MongoDB
def v_mongo(d):
    cx, cy = 1008, 360
    import math
    pts = [(cx, cy-70), (cx-75, cy+45), (cx+75, cy+45)]
    labels = ["PRIMARY", "SECONDARY", "SECONDARY"]
    cols = [C_DATA, "#86C99A", "#86C99A"]
    # lineas de replicacion
    for i in range(1,3):
        d.line([s(pts[0][0]), s(pts[0][1]), s(pts[i][0]), s(pts[i][1])], fill=BORDER, width=s(3))
    for (px,py),lab,col in zip(pts,labels,cols):
        d.ellipse([s(px-46), s(py-46), s(px+46), s(py+46)], fill=WHITE, outline=col, width=s(4))
        d.text((s(px), s(py)), "DB", font=F(20,"Bold"), fill=col, anchor="mm")
        d.text((s(px), s(py+62)), lab, font=F(13,"Semibold"), fill=SUB, anchor="mm")
    d.text((s(1008), s(515)), "Failover automático", font=F(17,"Medium"), fill=TITLE, anchor="mm")
concepto("04.png", 4, "MongoDB — Replica Set", "alta disponibilidad de datos", [
    ("Qué es:", "3 réplicas: 1 PRIMARY + 2 SECONDARY."),
    ("Cómo funciona:", "si cae el PRIMARY, eligen otro solos."),
    ("Transacción atómica:", "pedido + stock, todo o nada."),
    ("Por qué:", "los pedidos son dinero."),
], v_mongo)

# 5 — NetworkPolicy
def v_netpol(d):
    cx = 1008
    # escudo
    d.text((s(cx), s(310)), "🛡", font=F(70,"Regular"), fill=INDIGO, anchor="mm")
    d.text((s(cx), s(380)), "default-deny", font=F(22,"Bold"), fill=TITLE, anchor="mm")
    d.text((s(cx), s(415)), "todo bloqueado por defecto", font=F(15,"Regular"), fill=SUB, anchor="mm")
    for i,(t,ok) in enumerate([("API → Mongo",1),("Ingress → API",1),("pod random → Mongo",0)]):
        yy = 460 + i*34
        col = C_DATA if ok else C_EXT
        d.text((s(880), s(yy)), ("✓ " if ok else "✕ ")+t, font=F(17,"Medium"), fill=col, anchor="lm")
concepto("05.png", 5, "NetworkPolicy — firewall entre pods", "seguridad de red", [
    ("Qué es:", "reglas de quién habla con quién."),
    ("Estrategia:", "default-deny + permitir lo justo."),
    ("Motor:", "el CNI Calico la aplica."),
    ("Por qué:", "frena el movimiento lateral."),
], v_netpol)

# 6 — KEDA
def v_keda(d):
    base = 540
    for i in range(5):
        h = 30 + i*42
        x = 870 + i*58
        col = INDIGO if i < 1 else (CYAN if i < 4 else "#94A3B8")
        d.rounded_rectangle([s(x), s(base-h), s(x+40), s(base)], radius=s(6), fill=col)
    d.text((s(1008), s(280)), "1 → 5 pods", font=F(26,"Bold"), fill=TITLE, anchor="mm")
    d.text((s(1008), s(315)), "según la cola Redis", font=F(16,"Regular"), fill=SUB, anchor="mm")
    d.text((s(1008), s(575)), "escala con la demanda", font=F(15,"Medium"), fill=SUB, anchor="mm")
concepto("06.png", 6, "KEDA — escalado automático", "elasticidad bajo demanda", [
    ("Mide:", "la longitud de la cola Redis."),
    ("Sube:", "más pods del worker si se acumula."),
    ("Baja:", "a 1 cuando la cola se vacía."),
    ("Por qué:", "picos sin desperdiciar recursos."),
], v_keda)

# 7 — CI/CD
def v_cicd(d):
    steps = [("git push", C_EDGE), ("Tekton\nbuild", C_APP), ("Docker Hub\n+ registro", C_DATA), ("ArgoCD\ndeploy", C_WORK)]
    y = 393
    for i,(t,c) in enumerate(steps):
        x = 850 + i*0
        yy = 270 + i*78
        d.rounded_rectangle([s(850), s(yy-26), s(1166), s(yy+26)], radius=s(10), fill=WHITE, outline=c, width=s(3))
        d.text((s(1008), s(yy)), t.replace("\n"," "), font=F(18,"Semibold"), fill=c, anchor="mm")
        if i < 3:
            arrow(d, 1008, yy+26, 1008, yy+52, SUB)
concepto("07.png", 7, "CI/CD — Tekton + ArgoCD", "GitOps", [
    ("Tekton:", "con git push, construye la imagen."),
    ("Doble push:", "registro local + Docker Hub."),
    ("ArgoCD:", "despliega solo desde Git (selfHeal)."),
    ("Por qué:", "reproducible y auditable."),
], v_cicd)

# ============ SLIDE 8 — CANARY (NUMERO GRANDE) ============
img, d = new_slide()
head(d, "Canary — Argo Rollouts", kicker="despliegue sin downtime")
d.text((s(640), s(420)), "10%  →  100%", font=F(140, "Heavy"), fill=INDIGO, anchor="mm")
d.text((s(640), s(530)), "la versión nueva sube por pasos; si el error sube, rollback automático",
       font=F(24, "Medium"), fill=BODY, anchor="mm")
footer(d, 8)
save(img, "08.png")

# ============ SLIDE 9 — OBSERVABILIDAD ============
def v_obs(d):
    # mini grafica de lineas + barra
    import math
    ox, oy, ow, oh = 850, 300, 320, 180
    d.rounded_rectangle([s(ox), s(oy), s(ox+ow), s(oy+oh)], radius=s(10), fill=WHITE, outline=BORDER, width=s(2))
    pts = [(ox+10+i*30, oy+oh-30-int(40*math.sin(i/1.5)+40)) for i in range(10)]
    d.line([c for p in pts for c in (s(p[0]), s(p[1]))], fill=CYAN, width=s(3), joint="curve")
    d.text((s(ox+12), s(oy+18)), "latencia · cola · error-rate", font=F(13,"Medium"), fill=SUB, anchor="lm")
    d.text((s(1010), s(520)), "Prometheus · Loki · Grafana", font=F(17,"Semibold"), fill=TITLE, anchor="mm")
concepto("09.png", 9, "Observabilidad", "ver qué pasa adentro", [
    ("Métricas:", "Prometheus + alertas automáticas."),
    ("Logs:", "Loki centraliza todo."),
    ("Búsqueda:", "un pedido por su pedidoId."),
    ("Por qué:", "sin medir, no operas."),
], v_obs)

# ============ SLIDE 10 — SEGURIDAD ============
img, d = new_slide()
head(d, "Seguridad y gobernanza")
bullets(d, [
    ("Ingress + TLS:", "HTTPS con cert-manager (CA propia)."),
    ("ResourceQuota:", "límites de CPU/memoria por namespace."),
    ("Secrets:", "cifrados con SealedSecrets."),
    ("Contraseñas:", "hash con Argon2."),
], y0=250, gap=92)
footer(d, 10)
save(img, "10.png")

# ============ SLIDE 11 — NUMERO GRANDE (resiliencia) ============
img, d = new_slide()
head(d, "Resiliencia", kicker="lo que demuestro en vivo")
d.text((s(380), s(400)), "3", font=F(220, "Heavy"), fill=INDIGO, anchor="mm")
d.text((s(380), s(540)), "nodos · sin punto único de falla", font=F(22, "Medium"), fill=BODY, anchor="mm")
d.line([s(720), s(330), s(720), s(540)], fill=BORDER, width=s(3))
d.text((s(950), s(400)), "0", font=F(220, "Heavy"), fill=C_DATA, anchor="mm")
d.text((s(950), s(540)), "downtime en el deploy", font=F(22, "Medium"), fill=BODY, anchor="mm")
footer(d, 11)
save(img, "11.png")

# ============ SLIDE 12 — STACK ============
img, d = new_slide()
head(d, "Stack en una mirada")
rows = [
    ("Aplicación", "Node.js · Express · EJS · Alpine.js"),
    ("Datos", "MongoDB 7 (Replica Set) · Redis 7 + BullMQ"),
    ("Cluster", "kubeadm · Calico (VXLAN) · 3 nodos"),
    ("CI/CD", "Tekton · ArgoCD · Argo Rollouts"),
    ("Escalado", "KEDA + HPA"),
    ("Observabilidad", "Prometheus · Loki · Grafana"),
    ("Seguridad", "NetworkPolicy · cert-manager · SealedSecrets"),
]
y = 240
for i,(k,v) in enumerate(rows):
    if i % 2 == 0:
        d.rounded_rectangle([s(64), s(y-26), s(1216), s(y+26)], radius=s(8), fill=CARD)
    d.text((s(90), s(y)), k, font=F(21, "Bold"), fill=INDIGO, anchor="lm")
    d.text((s(430), s(y)), v, font=F(21, "Regular"), fill=BODY, anchor="lm")
    y += 60
footer(d, 12)
save(img, "12.png")

# ============ SLIDE 13 — CIERRE / DEMO ============
img, d = new_slide(bg=INDIGO)
d.rectangle([0, 0, W, s(10)], fill=CYAN)
d.text((s(64), s(280)), "Demo en vivo", font=F(80, "Bold"), fill=WHITE, anchor="lm")
d.line([s(64), s(360), s(64+260), s(360)], fill=CYAN, width=s(6))
d.text((s(64), s(420)), "Pasamos a las 7 demos en el cluster real.", font=F(28, "Medium"), fill="#E0E7FF", anchor="lm")
d.text((s(64), s(620)), "github.com/SEBASTIANCONTRERAS35/micrositio-pedidos", font=F(20, "Semibold", mono=True), fill="#C7D2FE", anchor="lm")
save(img, "13.png")

print(f"OK: 13 PNGs en {OUT} ({W}x{H})")
print(os.popen(f"ls -1 {OUT}").read())
