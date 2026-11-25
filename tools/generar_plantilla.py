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
COLUMNAS = ["Empresa", "Banco", "Moneda", "Tipo de cuenta", "Número de cuentas", "Uso principal", "Movimientos al mes"]
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

    cat = wb.create_sheet("Catalogos")
    cat.append(["Moneda", "Tipo de cuenta"])
    for i in range(max(len(MONEDAS), len(TIPOS))):
        cat.append([MONEDAS[i] if i < len(MONEDAS) else None, TIPOS[i] if i < len(TIPOS) else None])

    dv_mon = DataValidation(type="list", formula1=f"=Catalogos!$A$2:$A${len(MONEDAS) + 1}", allow_blank=True,
                            errorStyle="warning", showErrorMessage=True,
                            errorTitle="Moneda", error="Use MXN, USD o EUR; si es otra, escriba su código ISO.")
    dv_tipo = DataValidation(type="list", formula1=f"=Catalogos!$B$2:$B${len(TIPOS) + 1}", allow_blank=True,
                             showErrorMessage=True, errorTitle="Tipo de cuenta", error="Elija un tipo de la lista.")
    dv_cant = DataValidation(type="whole", operator="between", formula1="1", formula2="5000", allow_blank=True,
                             showErrorMessage=True, errorTitle="Número de cuentas",
                             error="Escriba cuántas cuentas son (un número entero), no el número de cuenta.")
    dv_mov = DataValidation(type="whole", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                            showErrorMessage=True, errorTitle="Movimientos", error="Escriba un número entero.")
    for dv, col in ((dv_mon, "C"), (dv_tipo, "D"), (dv_cant, "E"), (dv_mov, "G")):
        ws.add_data_validation(dv)
        dv.add(f"{col}2:{col}{FILAS + 1}")

    ins = wb.create_sheet("Instrucciones", 0)
    lineas = [
        "Plantilla de cuentas bancarias — Diagnóstico de tesorería",
        "",
        "NO escriba números de cuenta ni CLABE (ni siquiera parciales) ni saldos. No se piden y no deben enviarse.",
        "",
        "1. En la hoja “Cuentas”, llene una fila por cada grupo de cuentas con la misma empresa, banco, moneda y tipo. No cambie los encabezados.",
        "2. Empresa: escriba la razón social igual que en el paso 2 del cuestionario.",
        "3. Moneda y Tipo de cuenta: elija de la lista. Si la moneda es otra, escriba su código ISO (ej. CAD).",
        "4. Número de cuentas: cuántas cuentas tiene ese grupo (ej. 3), no el número de cuenta.",
        "5. Movimientos al mes: número aproximado de movimientos en un mes normal, sumando las cuentas del grupo.",
        "6. Guarde el archivo y cárguelo en el paso 3 del cuestionario. Se lee en su navegador; solo se toman estas columnas y el archivo no se envía.",
        "",
        "Ejemplo:  Empresa Ejemplo, S.A. de C.V. | BBVA México | MXN | Concentradora | 2 | Pago a proveedores | 350",
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
