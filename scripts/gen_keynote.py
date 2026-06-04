#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Construye un .key NATIVO con Keynote vía AppleScript (evita importar .pptx)."""
import subprocess

OUT = "/Users/emiliocontreras/Downloads/Proyectos/micrositio-pedidos/docs/presentacion-ejecutiva.key"

# (titulo, [vinetas], notas_presentador)
slides = [
    ("Micrositio de Pedidos y Delivery",
     ["Proyecto final — Kubernetes / DevOps",
      "Sebastian Contreras · Grupo G-02",
      "Capa sobre ZUYU (SaaS de punto de venta para PyMEs)"],
     "Construi un micrositio donde un cliente hace un pedido y se gestiona el repartidor automaticamente, todo en un cluster de Kubernetes hecho a mano."),
    ("El problema y la solucion",
     ["Problema: vender en linea y coordinar entregas sin montar infraestructura.",
      "Solucion: app web (catalogo, pedido, repartidor, entrega) lista para PRODUCCION.",
      "Alta disponibilidad, escalado automatico, seguridad de red, CI/CD y observabilidad."],
     "El objetivo no era solo que funcione, sino que este OPERADA como un sistema de produccion real."),
    ("Arquitectura",
     ["Cliente -> Ingress (HTTPS) -> API (Node/Express)",
      "API -> MongoDB (Replica Set x3)  [pedidos]",
      "API -> Redis (cola) -> Worker -> carrier de delivery",
      "3 nodos: 1 master + 2 workers (kubeadm + Calico). Desplegado por GitOps."],
     "El API atiende al cliente; lo pesado (pedir repartidor, notificar) lo hace un worker asincrono por una cola, para no bloquear la venta."),
    ("MongoDB — Replica Set (alta disponibilidad)",
     ["Que es: 3 instancias que replican los datos (1 PRIMARY + 2 SECONDARY).",
      "Como funciona: si el PRIMARY cae, eligen otro solos; cada pedido+stock es transaccion atomica.",
      "Por que: los pedidos son dinero, no se pueden perder ni quedar a medias."],
     "DEMO: voy a matar un nodo y el sistema sigue vendiendo."),
    ("NetworkPolicy — firewall entre pods",
     ["Que es: reglas de quien puede hablar con quien dentro del cluster.",
      "Como funciona: default-deny + permitir solo lo necesario. Lo aplica Calico.",
      "Por que: si un pod se compromete, no puede llegar a la base de datos."],
     "DEMO: un pod sin permiso intenta conectarse a Mongo y se cae: bloqueado por politica."),
    ("KEDA — escalado automatico",
     ["Que es: autoscaler que mide la longitud de la cola Redis del worker.",
      "Como funciona: si se acumulan pedidos crea mas pods (1 a 5); al vaciarse baja a 1.",
      "Por que: aguanta picos sin desperdiciar recursos en horas muertas."],
     "DEMO: inyecto carga a la cola y el worker pasa de 1 a 4 pods solo."),
    ("CI/CD — Tekton + ArgoCD (GitOps)",
     ["Tekton: con git push construye la imagen (Kaniko) y la sube al registro local y a Docker Hub.",
      "ArgoCD: vigila Git y despliega solo; selfHeal revierte cambios manuales.",
      "Por que: despliegues reproducibles, auditables, sin tocar el cluster a mano."],
     "Hago un push y el cluster se actualiza solo; si alguien edita a mano, ArgoCD lo regresa al estado de Git."),
    ("Argo Rollouts — Canary (cero downtime)",
     ["Que es: despliegue gradual de versiones nuevas del API.",
      "Como funciona: 10% -> 50% -> 100% por pasos; AnalysisTemplate hace rollback automatico si el error sube.",
      "Por que: una version rota no tumba a todos; se detecta y revierte sola."],
     "DEMO: promuevo el canary en vivo; si el error-rate sube, el rollout se devuelve solo."),
    ("Observabilidad — Loki + Prometheus + Grafana",
     ["Metricas (Prometheus): latencia, longitud de cola, error-rate + alertas.",
      "Logs (Loki + Alloy): centralizados; busco un pedido por su pedidoId en segundos.",
      "Por que: en produccion, sin medir no operas."],
     "DEMO: busco un pedido por su ID en los logs de Loki en vivo."),
    ("Seguridad y gobernanza",
     ["Ingress + TLS: HTTPS (zuyu.local) con certificado de cert-manager (CA propia).",
      "ResourceQuota: limites de CPU/memoria por namespace.",
      "Secrets cifrados con SealedSecrets; contrasenas con Argon2."],
     "DEMO: intento crear un pod que excede la cuota y el cluster lo rechaza."),
    ("Stack en una mirada",
     ["App: Node.js + Express + EJS + Alpine.js",
      "Datos: MongoDB 7 (Replica Set) · Redis 7 + BullMQ",
      "Cluster: kubeadm + Calico (VXLAN), 3 nodos",
      "CI/CD: Tekton + ArgoCD + Argo Rollouts | Escalado: KEDA",
      "Observabilidad: Prometheus + Loki + Grafana | Seguridad: NetworkPolicy + cert-manager"],
     "Todo esto es estandar de la industria; lo monte de cero sobre bare-metal."),
    ("Gracias — Demo en vivo",
     ["github.com/SEBASTIANCONTRERAS35/micrositio-pedidos",
      "Preguntas -> pasamos a las 7 demos en el cluster"],
     "Pasar directo a las demos en vivo."),
]


def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def body_as(bullets):
    return '" & return & "'.join(esc(b) for b in bullets)


lines = [
    'tell application "Keynote"',
    '  activate',
    '  set theDoc to make new document',
    '  set bulletMaster to missing value',
    '  repeat with m in (master slides of theDoc)',
    '    set mn to name of m',
    '    if bulletMaster is missing value and (mn contains "ullet" or mn contains "iñeta" or mn contains "Texto" or mn contains "Bullets") then set bulletMaster to m',
    '  end repeat',
    '  if bulletMaster is missing value then set bulletMaster to master slide 2 of theDoc',
]

for i, (title, bullets, notes) in enumerate(slides):
    if i == 0:
        sl = "slide 1 of theDoc"
        lines.append(f'  set the base slide of slide 1 of theDoc to bulletMaster')
    else:
        lines.append(f'  tell theDoc to set newSlide to make new slide with properties {{base slide:bulletMaster}}')
        sl = "newSlide"
    lines.append(f'  try')
    lines.append(f'    set object text of default title item of {sl} to "{esc(title)}"')
    lines.append(f'  end try')
    lines.append(f'  try')
    lines.append(f'    set object text of default body item of {sl} to "{body_as(bullets)}"')
    lines.append(f'  end try')
    lines.append(f'  set presenter notes of {sl} to "{esc(notes)}"')

lines.append(f'  save theDoc in POSIX file "{OUT}"')
lines.append('end tell')

script = "\n".join(lines)
SCPT = "/tmp/gen_keynote.applescript"
with open(SCPT, "w", encoding="utf-8") as f:
    f.write(script)
r = subprocess.run(["osascript", SCPT], capture_output=True, text=True)
print("STDOUT:", r.stdout.strip())
print("STDERR:", r.stderr.strip())
print("EXIT:", r.returncode)
