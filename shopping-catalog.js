(function(root){
const templates = [
        {
          id: 'mercado',
          title: 'Mercado',
          subtitle: 'Despensa, feira, carnes e casa',
          image: './assets/quick-lists/quick-market.jpg',
          groups: [
            {
              id: 'basicos',
              title: 'Básicos',
              items: [
                { id: 'arroz-branco', name: 'Arroz branco', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'arroz-integral', name: 'Arroz integral', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'feijao', name: 'Feijão', quantity: 2, unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'farinha-trigo', name: 'Farinha de trigo', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'trigo-integral', name: 'Trigo integral', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'oleo-cozinha', name: 'Óleo de cozinha', unitSingular: 'unidade', unitPlural: 'unidades' },
                { id: 'macarrao', name: 'Macarrão', quantity: 2, unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'acucar-refinado', name: 'Açúcar refinado', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'massa-pastel', name: 'Massa para pastel', unitSingular: 'pacote', unitPlural: 'pacotes' }
              ]
            },
            {
              id: 'padaria-cafe',
              title: 'Padaria e café',
              items: [
                { id: 'pao', name: 'Pão' },
                { id: 'cafe-po', name: 'Café em pó', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'cafe-capsula', name: 'Café cápsula', detail: 'descafeinado, se tiver', taskText: 'Café cápsula descafeinado, se tiver' },
                { id: 'leite', name: 'Leite', quantity: 2, unitSingular: 'unidade', unitPlural: 'unidades' },
                { id: 'biscoito-agua-sal', name: 'Biscoito água e sal', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'biscoito-sequilhos', name: 'Biscoito sequilhos', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'biscoito-polvilho-alice', name: 'Biscoito de polvilho', detail: 'para Alice', taskText: 'Biscoito de polvilho para Alice', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'geleia', name: 'Geleia', detail: 'morango ou outro sabor para matcha' },
                { id: 'amendoim-japones', name: 'Amendoim japonês', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'cha-camomila', name: 'Chá de camomila', unitSingular: 'caixa', unitPlural: 'caixas' },
                { id: 'cha-capim-cidreira', name: 'Chá de capim cidreira', unitSingular: 'caixa', unitPlural: 'caixas' },
                { id: 'cha-mate', name: 'Chá de mate', unitSingular: 'caixa', unitPlural: 'caixas' },
                { id: 'cacau-50', name: 'Cacau 50%' }
              ]
            },
            {
              id: 'hortifruti',
              title: 'Hortifruti',
              items: [
                { id: 'uva', name: 'Uva' },
                { id: 'banana', name: 'Banana' },
                { id: 'morango', name: 'Morango' },
                { id: 'tangerina', name: 'Tangerina' },
                { id: 'limao', name: 'Limão' },
                { id: 'alho', name: 'Alho', quantity: 4, unitSingular: 'cabeça', unitPlural: 'cabeças' },
                { id: 'cebola', name: 'Cebola', quantity: 3, unitSingular: 'unidade', unitPlural: 'unidades' },
                { id: 'alho-poro', name: 'Alho-poró' },
                { id: 'batata', name: 'Batata' },
                { id: 'batata-doce', name: 'Batata-doce' },
                { id: 'abobora-cabotia', name: 'Abóbora cabotiá' },
                { id: 'cenoura', name: 'Cenoura' },
                { id: 'tomate', name: 'Tomate' },
                { id: 'quiabo', name: 'Quiabo' },
                { id: 'milho-verde', name: 'Milho verde', unitSingular: 'unidade', unitPlural: 'unidades' },
                { id: 'ervilha-congelada', name: 'Ervilha congelada', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'seleta-legumes', name: 'Seleta de legumes congelada', unitSingular: 'pacote', unitPlural: 'pacotes' }
              ]
            },
            {
              id: 'carnes-frios',
              title: 'Carnes e frios',
              items: [
                { id: 'carne-moida', name: 'Carne moída', unitSingular: 'kg', unitPlural: 'kg', alwaysShowUnit: true },
                { id: 'peito-frango', name: 'Peito de frango', unitSingular: 'kg', unitPlural: 'kg', alwaysShowUnit: true },
                { id: 'coxa-sobrecoxa', name: 'Coxa e sobrecoxa de frango', unitSingular: 'kg', unitPlural: 'kg', alwaysShowUnit: true },
                { id: 'presunto-fatiado', name: 'Presunto fatiado', unitSingular: 'g', unitPlural: 'g', quantity: 200, step: 100, min: 100, max: 1000, alwaysShowUnit: true },
                { id: 'mucarela-fatiada', name: 'Queijo muçarela fatiado', unitSingular: 'g', unitPlural: 'g', quantity: 200, step: 100, min: 100, max: 1000, alwaysShowUnit: true },
                { id: 'ovos', name: 'Ovos', unitSingular: 'dúzia', unitPlural: 'dúzias', alwaysShowUnit: true }
              ]
            },
            {
              id: 'laticinios-conservas',
              title: 'Laticínios e conservas',
              items: [
                { id: 'creme-leite', name: 'Creme de leite', quantity: 2, unitSingular: 'unidade', unitPlural: 'unidades' },
                { id: 'requeijao', name: 'Requeijão' },
                { id: 'iogurte-natural', name: 'Iogurte natural' },
                { id: 'manteiga', name: 'Manteiga' },
                { id: 'queijo-parmesao', name: 'Queijo parmesão ralado', detail: 'para macarrão' },
                { id: 'cogumelo', name: 'Cogumelo champignon em conserva' },
                { id: 'azeitona', name: 'Azeitona sem caroço' },
                { id: 'palmito', name: 'Palmito' }
              ]
            },
            {
              id: 'temperos-molhos',
              title: 'Temperos e molhos',
              items: [
                { id: 'tempero-fit-frango', name: 'Tempero Fit Frango BR Spices' },
                { id: 'tempero-dry-rub', name: 'Tempero Dry Rub BR Spices' },
                { id: 'tempero-caldo-legumes', name: 'Tempero Caldo de Legumes BR Spices' },
                { id: 'tempero-chimichurri', name: 'Tempero Chimichurri' },
                { id: 'molho-ingles', name: 'Molho inglês' },
                { id: 'azeite', name: 'Azeite' },
                { id: 'molho-tomate', name: 'Molho de tomate' },
                { id: 'colorau', name: 'Colorau' }
              ]
            },
            {
              id: 'limpeza',
              title: 'Limpeza',
              items: [
                { id: 'papel-toalha-banheiro', name: 'Papel toalha', detail: 'para o banheiro' },
                { id: 'papel-higienico', name: 'Papel higiênico' },
                { id: 'luva-louca', name: 'Luva de borracha para lavar louça G' },
                { id: 'saco-lixo-15', name: 'Saco de lixo 15 L', unitSingular: 'rolo', unitPlural: 'rolos' },
                { id: 'saco-lixo-30', name: 'Saco de lixo 30 L', unitSingular: 'rolo', unitPlural: 'rolos' },
                { id: 'saco-lixo-100', name: 'Saco de lixo 100 L', unitSingular: 'rolo', unitPlural: 'rolos' },
                { id: 'sabao-lava-louca', name: 'Sabão para máquina de lavar louça' },
                { id: 'detergente-neutro', name: 'Detergente neutro', detail: 'sem ser da Ypê' },
                { id: 'sabao-liquido-roupa', name: 'Sabão líquido para lavar roupa', detail: 'Ariel ou Olá roupas delicadas' },
                { id: 'amaciante', name: 'Amaciante' },
                { id: 'sabao-liquido-maos', name: 'Sabão líquido para as mãos' },
                { id: 'limpador-multiuso', name: 'Limpador multiuso' },
                { id: 'desengordurante-cozinha', name: 'Desengordurante de cozinha' }
              ]
            },
            {
              id: 'higiene',
              title: 'Higiene pessoal',
              items: [
                { id: 'absorvente-abas', name: 'Absorvente com abas Sempre Livre' },
                { id: 'creme-rosto-nivea', name: 'Creme para o rosto Nívea' },
                { id: 'sabonete', name: 'Sabonete' },
                { id: 'shampoo-elseve', name: 'Shampoo Elseve Óleo Extraordinário' },
                { id: 'condicionador', name: 'Condicionador' },
                { id: 'mascara-hidratacao-capilar', name: 'Máscara de hidratação capilar' }
              ]
            }
          ]
        },
        {
          id: 'farmacia',
          title: 'Farmácia',
          subtitle: 'Remédios, bebê e cuidados',
          image: './assets/quick-lists/quick-pharmacy.jpg',
          groups: [
            {
              id: 'medicamentos',
              title: 'Medicamentos',
              items: [
                { id: 'dipirona-gotas', name: 'Dipirona em gotas adulto' },
                { id: 'advil', name: 'Advil' },
                { id: 'histamin', name: 'Histamin' },
                { id: 'alopurinol', name: 'Alopurinol 100mg' },
                { id: 'soro-fisiologico', name: 'Soro fisiológico' }
              ]
            },
            {
              id: 'suplementos',
              title: 'Suplementos',
              items: [
                { id: 'feminis', name: 'Feminis suplemento alimentar cápsulas' },
                { id: 'zirvit-kids', name: 'Zirvit Kids Max', detail: 'suplemento alimentar em suspensão' }
              ]
            },
            {
              id: 'bebe-crianca',
              title: 'Bebê e criança',
              items: [
                { id: 'bepantol-baby', name: 'Bepantol Baby' },
                { id: 'lenco-johnson-rn', name: 'Lenço umedecido Johnson recém-nascido', detail: '96 folhas' },
                { id: 'escova-dentes-2-anos', name: 'Escova de dentes 2 anos +' },
                { id: 'papinha-papapa', name: 'Papinha Papapá' },
                { id: 'biscoito-papapa', name: 'Biscoito Papapá' }
              ]
            },
            {
              id: 'pele-banho',
              title: 'Pele e banho',
              items: [
                { id: 'gel-banho-mustela', name: 'Gel de banho Mustela cabelo e corpo' },
                { id: 'hidratante-infantil', name: 'Hidratante infantil', detail: 'Mustela Stelatopia+, CeraVe ou Cetaphil', taskText: 'Hidratante Mustela Stelatopia+, CeraVe ou Cetaphil' }
              ]
            },
            {
              id: 'primeiros-socorros',
              title: 'Primeiros socorros',
              items: [
                { id: 'curativos-adesivos', name: 'Curativos adesivos', unitSingular: 'caixa', unitPlural: 'caixas' },
                { id: 'gaze-esteril', name: 'Gaze estéril', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'esparadrapo', name: 'Esparadrapo' },
                { id: 'fita-micropore', name: 'Fita micropore' },
                { id: 'atadura-crepe', name: 'Atadura de crepe' },
                { id: 'algodao', name: 'Algodão', unitSingular: 'pacote', unitPlural: 'pacotes' },
                { id: 'alcool-70', name: 'Álcool 70%' },
                { id: 'antisseptico', name: 'Antisséptico' },
                { id: 'termometro-digital', name: 'Termômetro digital' },
                { id: 'luvas-descartaveis', name: 'Luvas descartáveis', unitSingular: 'caixa', unitPlural: 'caixas' }
              ]
            },
            {
              id: 'maternidade',
              title: 'Maternidade',
              items: [
                { id: 'absorvente-seios', name: 'Absorvente para os seios' }
              ]
            }
          ]
        },
        {
          id: 'pet',
          title: 'Pet',
          subtitle: 'Alimentação, proteção e saúde',
          image: './assets/quick-lists/quick-pet.jpg',
          groups: [
            {
              id: 'alimentacao',
              title: 'Alimentação',
              items: [
                { id: 'racao-seca', name: 'Ração seca' },
                { id: 'racao-umida', name: 'Ração úmida' },
                { id: 'petiscos', name: 'Petiscos' },
                { id: 'comedouro', name: 'Comedouro' },
                { id: 'bebedouro', name: 'Bebedouro' },
                { id: 'racao-senior', name: 'Ração sênior' },
                { id: 'racao-senior-golden', name: 'Ração sênior Golden' }
              ]
            },
            {
              id: 'passeio-seguranca',
              title: 'Passeio e segurança',
              items: [
                { id: 'coleira-identificacao', name: 'Coleira com identificação' },
                { id: 'guia', name: 'Guia' },
                { id: 'peitoral', name: 'Peitoral' },
                { id: 'caixa-transporte', name: 'Caixa de transporte' }
              ]
            },
            {
              id: 'casa-higiene',
              title: 'Casa e higiene',
              items: [
                { id: 'cama-pet', name: 'Cama para pet' },
                { id: 'brinquedos-pet', name: 'Brinquedos para pet' },
                { id: 'escova-pente-pet', name: 'Escova e pente para pet' },
                { id: 'escova-dentes-pet', name: 'Escova de dentes para pet' },
                { id: 'caixa-areia', name: 'Caixa de areia' },
                { id: 'areia-higienica', name: 'Areia higiênica' }
              ]
            },
            {
              id: 'antiparasitarios',
              title: 'Antiparasitários',
              items: [
                { id: 'coleira-leishmania', name: 'Coleira de leishmania' },
                { id: 'bravecto', name: 'Bravecto' },
                { id: 'vermifugo-topdog-milbemax', name: 'Top Dog vermífugo 10kg ou Milbemax 5 a 25kg' }
              ]
            },
            {
              id: 'saude',
              title: 'Saúde',
              items: [
                { id: 'ograx-derme', name: 'Ograx Derme 10' },
                { id: 'gaviz', name: 'Gaviz 10mg' },
                { id: 'hepvet', name: 'Hepvet' }
              ]
            }
          ]
        }
      ];
if(typeof module!=="undefined") module.exports=templates; else root.ShoppingCatalog=templates;
})(typeof globalThis!=="undefined"?globalThis:this);
