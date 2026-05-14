#!/bin/bash
# Demo 7: Busqueda de pedido por ID en Loki (2 min)

echo "════════════════════════════════════════════════════"
echo "DEMO 7: Busqueda de pedido por ID en Loki (2 min)"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. Crear 3 pedidos de prueba en https://zuyu.local/tienda/demo"
echo "   - Apuntar los pedidoIds (ej: PED-2606-0001, PED-2606-0002, etc.)"
echo ""

read -p "[ENTER cuando hayas creado los pedidos]"
read -p "Ingresa el pedidoId que quieres buscar (ej: PED-2606-0001): " PEDIDO

echo ""
echo "2. Abrir Grafana:"
echo "   kubectl port-forward -n monitoring svc/prometheus-grafana 3001:80"
echo "   open http://localhost:3001"
echo "   (admin / admin-cambiar-en-produccion)"
echo ""

echo "3. Ir a Explore -> seleccionar datasource Loki"
echo ""
echo "4. Ejecutar la query:"
echo ""
echo "   {namespace=\"micrositio\"} | json | pedidoId=\"$PEDIDO\""
echo ""
echo "5. Resultado esperado:"
echo "   - Log del API cuando se creo el pedido"
echo "   - Log del worker cuando proceso la notificacion"
echo "   - Log del worker cuando solicito el repartidor"
echo "   - Logs ordenados cronologicamente"
echo ""

echo "6. Demostrar tiempo total:"
echo "   - Buscar -> ver toda la historia del pedido en <30 segundos"
echo "   - Sin Loki, esto requeriria revisar varias bases y servicios manualmente"
echo ""

echo "════════════════════════════════════════════════════"
echo "DEMO 7 COMPLETADA"
echo "════════════════════════════════════════════════════"
