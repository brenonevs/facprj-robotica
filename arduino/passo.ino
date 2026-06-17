#include <AccelStepper.h>

// Verifica em tempo de compilação se a placa selecionada é o Mega 2560
#if !defined(__AVR_ATmega2560__)
  #error "ATENÇÃO: A placa selecionada na IDE não é o Arduino Mega 2560! Altere em Ferramentas > Placa."
#endif

// Definição dos pinos no Arduino Mega 2560
const int pino_step   = 44; 
const int pino_dir    = 42; 
const int pino_enable = 46; 
const int pino_reset  = 48; 
const int pino_sleep  = 50; 

AccelStepper motor(1, pino_step, pino_dir);

void setup() {
  // Inicia a comunicação Serial para debug (configure o Monitor Serial para 115200 baud)
  Serial.begin(115200);
  delay(1000); // Aguarda a serial estabilizar
  
  Serial.println("\n--- INICIANDO DIAGNÓSTICO DO SISTEMA ---");
  Serial.println("Hardware reconhecido: Arduino Mega 2560");
  
  // 1. Configuração dos pinos
  pinMode(pino_step, OUTPUT);
  pinMode(pino_dir, OUTPUT);
  pinMode(pino_enable, OUTPUT);
  pinMode(pino_reset, OUTPUT);
  pinMode(pino_sleep, OUTPUT);

  Serial.println("Todos os pinos configurados como SAIDA (OUTPUT).");
  
  // 2. Rotina de Teste Físico dos Pinos (Opcional, mas recomendado na primeira montagem)
  // Este bloco coloca todos os pinos de controle em HIGH por 3 segundos para você medir com multímetro
  Serial.println("\n[TESTE DE PINAGEM] Colocando pinos Enable, Reset e Sleep em HIGH (5V)...");
  Serial.println("-> Use um multimetro agora nos pinos 46, 48 e 50 para confirmar os 5V.");
  digitalWrite(pino_enable, HIGH);
  digitalWrite(pino_reset, HIGH);
  digitalWrite(pino_sleep, HIGH);
  delay(5000); // 5 segundos para você medir

  Serial.println("\n[TESTE DE PINAGEM] Colocando pinos em LOW (0V)...");
  Serial.println("-> A tensao nos pinos deve cair para 0V.");
  digitalWrite(pino_enable, LOW);
  digitalWrite(pino_reset, LOW);
  digitalWrite(pino_sleep, LOW);
  delay(3000);

  // 3. Inicialização real do Driver A4988 para o teste do motor
  Serial.println("\n--- FINALIZANDO DIAGNOSTICO. PREPARANDO MOTOR ---");
  digitalWrite(pino_enable, LOW);  // LOW liga o motor (bobinas energizadas)
  digitalWrite(pino_reset, HIGH);  // HIGH tira o driver do estado de reset
  digitalWrite(pino_sleep, HIGH);  // HIGH tira o driver do modo de suspensão
  delay(10); // Estabiliza o chip

  // 4. Configuração do motor
  motor.setMaxSpeed(1000.0);     
  motor.setAcceleration(500.0);  
  
  Serial.println("Motor configurado. Iniciando loop de movimento...");
}

void loop() {
  Serial.println("Movendo 200 passos (Sentido 1)...");
  motor.moveTo(200);
  motor.runToPosition(); 

  delay(1000);

  Serial.println("Retornando para a posicao 0 (Sentido 2)...");
  motor.moveTo(0);
  motor.runToPosition();

  delay(1000);
}