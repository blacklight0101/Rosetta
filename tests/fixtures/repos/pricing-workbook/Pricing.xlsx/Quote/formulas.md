# Formulas of sheet "Quote"
- Formula cells: 3

## Region B3:B5 (3 formulas)
B3 = VLOOKUP(B1,Rates!A2:B4,2,FALSE)    [cached: 8.5]
B4 = IF(B2>=100,0.1,0)    [cached: 0.1]
B5 = B2*B3*(1-B4)    [cached: 918]
