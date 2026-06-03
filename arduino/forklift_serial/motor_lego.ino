const int gnd = 4;
const int vcc = 5;

// para ativar o encoder
const int enable1 = 13; 
const int enable2 = 12; 

// entradas de controle - motor 1
const int in1 = 10;
const int in2 = 9;

// entradas de controle - motor 2
const int in3 = 8;
const int in4 = 7;

// canais do encoder - motor 1
const int a1 = 2;
const int a2 = 3;

// canal do encoder - motor 2
const int b1 = 6;
const int b2 = 11;

// Controle de tempo da interrupção do calculo da velocidade
volatile int count = 0; // Adicionado volatile
unsigned long int tempoComeco = 0;
unsigned long int tempoFim = 0;

// Controle de tempo do pwm
unsigned long int tempoComecoPwm = 0;
unsigned long int tempoFimPwm = 0;
unsigned long int janelaTempoPwm = 1000; // ms

// Parâmetros do controlador
const float kp = 1.3;
const float setPoint = 80; // de velocidade (RPM)

// Janela de tempo para calculo da velocidade e tempo geral do algoritmo de correcao pwm
unsigned long int janelaTempo = 500;

float vAngular = 0; 
int pwm = 60; // Valor inicial do PWM (definido no setup)

void ajustaPwm() {
  float erro = setPoint - vAngular;
  
  // Controle Proporcional (P) sem o acúmulo descontrolado do I
  float saida = kp * erro;
  
  // Soma o ajuste ao PWM atual
  pwm = pwm + saida;
  
  // Restringe o valor do PWM entre 0 e 255
  pwm = constrain(pwm, 0, 255);

  Serial.println("----------------");
  Serial.print("Velocidade Medida: "); Serial.println(vAngular);
  Serial.print("Erro: "); Serial.println(erro);
  Serial.print("Saída do Ajuste: "); Serial.println(saida);
  Serial.print("Novo PWM: "); Serial.println(pwm);
  Serial.println("----------------");
  
  analogWrite(enable2, pwm);
}

void count_sent(){
  count++;
}


void setup() {
  pinMode(gnd, OUTPUT); 
  pinMode(vcc, OUTPUT); 

  // habilitando o encoder
  pinMode(enable1, OUTPUT); 
  pinMode(enable2, OUTPUT);

  // Definindo pinos
  pinMode(a2, INPUT); 

  // Interrupção DO CALCULO DA RPM no setup
  attachInterrupt(digitalPinToInterrupt(a2), count_sent, RISING);

  // Entradas do controle
  // motor 1
  pinMode(in1, OUTPUT);
  pinMode(in2, OUTPUT);
  // motor 2
  pinMode(in3, OUTPUT);
  pinMode(in4, OUTPUT);

  digitalWrite(enable1, HIGH);
  digitalWrite(enable2, HIGH);

  // Inicia o motor
  analogWrite(enable2, pwm);

  Serial.begin(9600); // Set baud rate for the Serial Monitor
}


void loop() {
  // padrao
  tempoFim = millis();
  tempoFimPwm = millis();

  //vccs
  digitalWrite(gnd, LOW);
  digitalWrite(vcc, HIGH);

  // Se iniciou, o tempo é agora (para o calculo da rpm)
  if(tempoComeco == 0){
    tempoComeco = millis(); 
  }

  // Se iniciou, o tempo é agora (para o correcao do pwm)
  if(tempoComecoPwm == 0){
    tempoComecoPwm = millis(); 
  }

  // JANELA DE TEMPO DO CALCULO DA RPM
  if ((tempoFim - tempoComeco) > (janelaTempo)){
    tempoComeco = millis(); // Reinicia corretamente
    
    // 1 rotacao tem 180 pulsos
    vAngular = (float(count) / 180.0) * 60000.0 / janelaTempo;
    
    Serial.print("Count: ");
    Serial.println(count);
    Serial.print("Velocidade angular: ");
    Serial.println(vAngular);
    
    count = 0;
  }

  // JANELA DE TEMPO DO CONTROLE PWM
  if ((tempoFimPwm - tempoComecoPwm) > janelaTempoPwm){
    tempoComecoPwm = millis(); // Reinicia corretamente
    
    // Só roda o cálculo se o vAngular for maior que 0 para evitar divisão por zero
    if (vAngular >= 0) {
      ajustaPwm();
    }
  }

  // Enviando sinal de pwm para o motor 1
  digitalWrite(in3, HIGH);
  digitalWrite(in4, LOW);
}