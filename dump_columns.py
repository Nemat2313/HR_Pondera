import json

with open('dataset_summary.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cols = data['columns']
with open('all_columns.txt', 'w', encoding='utf-8') as out:
    for c in cols:
        out.write(f"{c['index']}: {c['name']}\n")

print(f"Total columns written: {len(cols)}")
