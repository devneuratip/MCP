import { useState } from 'react'
import './App.css'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="app">
      <header>
        <div className="logo">AI Future</div>
        <nav className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
        <button className="menu-button" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          ☰
        </button>
      </header>

      <main>
        <section id="home" className="hero">
          <h1>O Futuro é Agora</h1>
          <p>Descubra como a Inteligência Artificial está transformando o mundo</p>
          <button className="cta-button">Saiba Mais</button>
        </section>

        <section id="features" className="features">
          <h2>Recursos Principais</h2>
          <div className="feature-grid">
            <div className="feature-card">
              <h3>Machine Learning</h3>
              <p>Sistemas que aprendem e evoluem com dados</p>
            </div>
            <div className="feature-card">
              <h3>Deep Learning</h3>
              <p>Redes neurais profundas para análise complexa</p>
            </div>
            <div className="feature-card">
              <h3>Natural Language</h3>
              <p>Processamento avançado de linguagem natural</p>
            </div>
            <div className="feature-card">
              <h3>Computer Vision</h3>
              <p>Análise e compreensão de imagens e vídeos</p>
            </div>
          </div>
        </section>

        <section id="about" className="about">
          <h2>Sobre Nós</h2>
          <p>
            Somos uma equipe apaixonada por tecnologia e inovação, dedicada a
            explorar e compartilhar os avanços mais recentes em Inteligência
            Artificial.
          </p>
        </section>

        <section id="contact" className="contact">
          <h2>Entre em Contato</h2>
          <form className="contact-form">
            <input type="email" placeholder="Seu email" />
            <textarea placeholder="Sua mensagem"></textarea>
            <button type="submit">Enviar</button>
          </form>
        </section>
      </main>

      <footer>
        <p>&copy; 2025 AI Future. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}

export default App
