-- A ordem de inserção dos itens de refeição. As linhas que já existem recebem a sequência na
-- ordem física da tabela, que é a ordem em que elas saíam até aqui.
-- AlterTable
ALTER TABLE "MealItem" ADD COLUMN     "seq" SERIAL NOT NULL;
