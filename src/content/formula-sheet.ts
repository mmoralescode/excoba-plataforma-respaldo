// Referencia general: sin importar el banco ni sustituir datos de los reactivos.
export const formulaSheet = [
  {
    subject: "Matemáticas",
    formulas: [
      ["Ecuación cuadrática", "x = (−b ± √(b² − 4ac)) / (2a)", "Para ax² + bx + c = 0, con a ≠ 0."],
      [
        "Geometría",
        "Atriángulo = bh/2 · Acírculo = πr² · Lcircunferencia = 2πr",
        "b: base; h: altura perpendicular; r: radio.",
      ],
      [
        "Pitágoras y pendiente",
        "c² = a² + b² · m = (y₂ − y₁)/(x₂ − x₁)",
        "c: hipotenusa de un triángulo rectángulo; pendiente si x₂ ≠ x₁.",
      ],
      [
        "Media y probabilidad",
        "x̄ = Σxᵢ/n · P(A) = casos favorables / casos posibles",
        "n: número de datos; la razón de casos requiere resultados equiprobables.",
      ],
      [
        "Combinaciones",
        "C(n,k) = n! / (k!(n − k)!)",
        "Selecciones sin repetición y sin importar el orden, 0 ≤ k ≤ n.",
      ],
      [
        "Porcentajes e interés simple",
        "parte = total · p/100 · I = Crt",
        "C: capital; r: tasa decimal por periodo; t: número de esos periodos.",
      ],
    ],
  },
  {
    subject: "Física",
    formulas: [
      [
        "Movimiento",
        "vmedia = Δx/Δt · a = Δv/Δt · Δx = v₀t + at²/2",
        "La última ecuación requiere aceleración constante. x: posición; v: velocidad; t: tiempo.",
      ],
      [
        "Fuerzas",
        "ΣF = ma · peso = mg",
        "m: masa; a: aceleración; g: aceleración gravitatoria indicada en el problema.",
      ],
      [
        "Energía, trabajo y potencia",
        "Ec = mv²/2 · Ep = mgh · W = Fd cos θ · P = W/Δt",
        "Ep cerca de la superficie con g constante; W para fuerza constante; θ entre fuerza y desplazamiento.",
      ],
      [
        "Fluidos",
        "ρ = m/V · p = F⊥/A · Δp = ρgh",
        "ρ: densidad; V: volumen; A: área; h: profundidad en un fluido de densidad constante.",
      ],
      [
        "Electricidad y calor",
        "V = IR · Peléctrica = VI · Q = mcΔT",
        "R: resistencia óhmica; I: corriente; c: calor específico. Q sin cambio de fase.",
      ],
      [
        "Unidades",
        "1 km = 1000 m · 1 h = 3600 s · 1 N = 1 kg·m/s²",
        "En el SI: energía en joules, potencia en watts y presión en pascales.",
      ],
    ],
  },
  {
    subject: "Química",
    formulas: [
      [
        "Estructura atómica",
        "A = Z + N",
        "A: número másico; Z: protones; N: neutrones. En un átomo neutro, electrones = Z.",
      ],
      [
        "Cantidad de sustancia",
        "n = m/Mₘ · Npartículas = nN_A",
        "Mₘ: masa molar. La constante de Avogadro vale 6.02214076 × 10²³ mol⁻¹. Usa la precisión indicada en el reactivo.",
      ],
      [
        "Concentración y dilución",
        "c = n/V · c₁V₁ = c₂V₂",
        "V en litros para c en mol/L. La dilución conserva el soluto, sin reacción; usa unidades compatibles.",
      ],
      [
        "Porcentaje en masa",
        "% m/m = (msoluto / mdisolución) × 100",
        "mdisolución = msoluto + mdisolvente.",
      ],
      [
        "Acidez",
        "pH ≈ −log₁₀[H⁺] · pH + pOH ≈ 14",
        "Aproximación para disoluciones acuosas diluidas; la segunda relación corresponde a 25 °C.",
      ],
      [
        "Gases ideales",
        "PV = nRT",
        "T en kelvin; R = 0.082057 L·atm·mol⁻¹·K⁻¹ si P está en atm y V en L.",
      ],
    ],
  },
] as const;
