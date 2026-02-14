-- Predefined Pixelz boards (level 1–10): same board for everyone to compare scores.
insert into public.boards (id, width, height, num_colors, seed)
values
  ('pixelz_level_1',  7, 10, 5, 'level-1'),
  ('pixelz_level_2',  7, 10, 5, 'level-2'),
  ('pixelz_level_3',  7, 10, 5, 'level-3'),
  ('pixelz_level_4',  7, 10, 5, 'level-4'),
  ('pixelz_level_5',  7, 10, 5, 'level-5'),
  ('pixelz_level_6',  7, 10, 5, 'level-6'),
  ('pixelz_level_7',  7, 10, 5, 'level-7'),
  ('pixelz_level_8',  7, 10, 5, 'level-8'),
  ('pixelz_level_9',  7, 10, 5, 'level-9'),
  ('pixelz_level_10', 7, 10, 5, 'level-10')
on conflict (id) do nothing;
