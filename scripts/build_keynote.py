#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ensambla un .key nativo insertando los PNGs a sangre completa + notas."""
import subprocess, os

OUT = "/Users/emiliocontreras/Downloads/Proyectos/micrositio-pedidos/docs/presentacion-ejecutiva.key"
PNG = "/tmp/zuyu_slides"

# notas del presentador por slide (lo que DICES; no va en pantalla)
notas = [
    "Construi un micrositio donde un cliente pide a un negocio y se gestiona el repartidor automaticamente, todo en un cluster de Kubernetes que monte de cero.",
    "El objetivo no era solo que funcione, sino operarlo como un sistema de produccion real: HA, escalado, seguridad, CI/CD y observabilidad.",
    "El flujo sincrono es Cliente -> Ingress -> API -> Mongo. Lo pesado (pedir repartidor, notificar) es asincrono: la API encola un job en Redis y el Worker lo procesa, para no bloquear la venta. Mongo, Redis, API y Worker viven dentro del cluster; el carrier es externo.",
    "DEMO: voy a matar un nodo de Mongo y el Replica Set elige un nuevo PRIMARY solo; el sistema sigue vendiendo. El pedido + descuento de stock va en una transaccion atomica.",
    "DEMO: un pod sin permiso intenta conectarse a Mongo y la conexion se cae. default-deny bloquea todo y solo abro lo necesario. Lo aplica Calico.",
    "DEMO: inyecto carga a la cola Redis y KEDA escala el worker de 1 a varios pods; al vaciarse, baja a 1.",
    "DEMO: hago git push, Tekton construye la imagen y la sube al registro local y a Docker Hub, y ArgoCD la despliega solo. Si edito algo a mano, selfHeal lo revierte.",
    "DEMO: promuevo el canary. La version nueva sube 10 -> 50 -> 100 por ciento por pasos; si el AnalysisTemplate detecta error alto, hace rollback automatico.",
    "DEMO: busco un pedido por su pedidoId en los logs de Loki en Grafana. Prometheus mide latencia, cola y error-rate con alertas.",
    "DEMO: intento crear un pod que excede la ResourceQuota del namespace y el cluster lo rechaza. TLS con cert-manager, secrets con SealedSecrets, passwords con Argon2.",
    "Estos son los numeros que demuestro en vivo: 3 nodos sin punto unico de falla y cero downtime durante el despliegue canary.",
    "Resumen del stack: todo herramientas estandar de la industria, montadas de cero sobre bare-metal.",
    "Cierre. Pasamos a las 7 demos en el cluster real. El repo esta publico en GitHub.",
]

def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')

lines = [
    'tell application "Keynote"',
    '  activate',
    '  set theDoc to make new document with properties {document theme:theme "Blanco"}',
    '  set the width of theDoc to 1920',
    '  set the height of theDoc to 1080',
    '  set docW to width of theDoc',
    '  set docH to height of theDoc',
    '  set blankMaster to missing value',
    '  repeat with m in (master slides of theDoc)',
    '    set mn to name of m',
    '    if blankMaster is missing value and (mn contains "lanco" or mn contains "Blank" or mn contains "vac") then set blankMaster to m',
    '  end repeat',
    '  if blankMaster is missing value then set blankMaster to last master slide of theDoc',
]

for i in range(13):
    img = f"{PNG}/{i+1:02d}.png"
    if i == 0:
        lines.append('  set sld to slide 1 of theDoc')
        lines.append('  set base slide of sld to blankMaster')
    else:
        lines.append('  tell theDoc to set sld to make new slide with properties {base slide:blankMaster}')
    lines.append(f'  tell sld to make new image with properties {{file:(POSIX file "{img}"), position:{{0, 0}}, width:docW, height:docH}}')
    lines.append(f'  set presenter notes of sld to "{esc(notas[i])}"')

lines.append(f'  save theDoc in POSIX file "{OUT}"')
lines.append(f'  return (docW as string) & "x" & (docH as string)')
lines.append('end tell')

script = "\n".join(lines)
scpt = "/tmp/build_keynote.applescript"
with open(scpt, "w", encoding="utf-8") as f:
    f.write(script)

r = subprocess.run(["osascript", scpt], capture_output=True, text=True)
print("STDOUT:", r.stdout.strip())
print("STDERR:", r.stderr.strip())
print("EXIT:", r.returncode)
