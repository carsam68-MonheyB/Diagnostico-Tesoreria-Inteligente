"""Genera assets/plantillas/plantilla_cuentas.xlsx y .csv.

Uso (desde la raíz del repositorio):  python3 tools/generar_plantilla.py
Requiere openpyxl (pip install openpyxl). Los catálogos deben coincidir con
assets/js/catalogos.js (monedas y tipos_cuenta).
"""
import csv
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "assets" / "plantillas"
COLUMNAS = ["Empresa", "Banco", "Moneda", "Últimos 4 dígitos", "Tipo de cuenta", "Uso principal", "Movimientos al mes"]
ANCHOS = [34, 22, 10, 18, 18, 34, 20]
MONEDAS = ["MXN", "USD", "EUR"]
TIPOS = ["Cheques", "Inversión", "Concentradora", "Dispersora", "Recaudadora", "En el extranjero"]
FILAS = 500


def xlsx():
    wb = Workbook()
    ws = wb.active
    ws.title = "Cuentas"
    ws.append(COLUMNAS)
    for i, ancho in enumerate(ANCHOS, start=1):
        ws.column_dimensions[chr(64 + i)].width = ancho
        celda = ws.cell(row=1, column=i)
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor="1F4E79")
        celda.alignment = Alignment(vertical="center", wrap_text=True)
    ws.freeze_panes = "A2"
    # Últimos 4 dígitos como texto para conservar ceros a la izquierda
    for fila in range(2, FILAS + 2):
        ws.cell(row=fila, column=4).number_format = "@"

    cat = wb.create_sheet("Catalogos")
    cat.append(["Moneda", "Tipo de cuenta"])
    for i in range(max(len(MONEDAS), len(TIPOS))):
        cat.append([MONEDAS[i] if i < len(MONEDAS) else None, TIPOS[i] if i < len(TIPOS) else None])

    dv_mon = DataValidation(type="list", formula1=f"=Catalogos!$A$2:$A${len(MONEDAS) + 1}", allow_blank=True,
                            errorStyle="warning", showErrorMessage=True,
                            errorTitle="Moneda", error="Use MXN, USD o EUR; si es otra, escriba su código ISO.")
    dv_tipo = DataValidation(type="list", formula1=f"=Catalogos!$B$2:$B${len(TIPOS) + 1}", allow_blank=True,
                             showErrorMessage=True, errorTitle="Tipo de cuenta", error="Elija un tipo de la lista.")
    dv_dig = DataValidation(type="textLength", operator="equal", formula1="4", allow_blank=True,
                            showErrorMessage=True, errorTitle="Últimos 4 dígitos",
                            error="Escriba solo los últimos 4 dígitos de la cuenta o CLABE.")
    dv_mov = DataValidation(type="whole", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                            showErrorMessage=True, errorTitle="Movimientos", error="Escriba un número entero.")
    for dv, col in ((dv_mon, "C"), (dv_tipo, "E"), (dv_dig, "D"), (dv_mov, "G")):
        ws.add_data_validation(dv)
        dv.add(f"{col}2:{col}{FILAS + 1}")

    ins = wb.create_sheet("Instrucciones", 0)
    lineas = [
        "Plantilla de cuentas bancarias — Diagnóstico de tesorería",
        "",
        "1. Llene una fila por cuenta en la hoja “Cuentas”. No cambie los encabezados.",
        "2. Empresa: escriba la razón social igual que en el paso 2 del cuestionario.",
        "3. Últimos 4 dígitos: SOLO los últimos 4 dígitos de la cuenta o CLABE. Nunca el número completo.",
        "4. Moneda y Tipo de cuenta: elija de la lista. Si la moneda es otra, escriba su código ISO (ej. CAD).",
        "5. Movimientos al mes: número aproximado de movimientos que tiene la cuenta en un mes normal.",
        "6. Guarde el archivo y cárguelo en el paso 3 del cuestionario. Se lee en su navegador; el archivo no se envía.",
        "",
        "Ejemplo:  Empresa Ejemplo, S.A. de C.V. | BBVA México | MXN | 1234 | Concentradora | Pago a proveedores | 350",
    ]
    for linea in lineas:
        ins.append([linea])
    ins["A1"].font = Font(bold=True, size=13)
    ins.column_dimensions["A"].width = 110
    wb.active = 1
    DESTINO.mkdir(parents=True, exist_ok=True)
    wb.save(DESTINO / "plantilla_cuentas.xlsx")


def csv_():
    with open(DESTINO / "plantilla_cuentas.csv", "w", newline="", encoding="utf-8-sig") as f:
        csv.writer(f).writerow(COLUMNAS)


if __name__ == "__main__":
    xlsx()
    csv_()
    print("Plantillas generadas en", DESTINO)
